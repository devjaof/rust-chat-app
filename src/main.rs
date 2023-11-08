use rocket::{State, Shutdown};
use rocket::fs::{relative, FileServer};
use rocket::form::Form;
use rocket::response::stream::{EventStream, Event};
use rocket::serde::{Serialize, Deserialize};
use rocket::tokio::sync::broadcast::{channel, Sender, error::RecvError};
use rocket::tokio::select;

// torna o uso de macros do rocket global
#[macro_use] extern crate rocket;

/*
    Debug -> para printar a struct no formato debug
    Clone -> para poder duplicar mensagens
    FromForm -> pegar os dados de um form e transformar na struct
*/
#[derive(Debug, Clone, FromForm, Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
struct Message {
    #[field(validate = len(..30))]
    pub room: String,
    
    #[field(validate = len(..20))]
    pub username: String,

    pub message: String,
}

#[post("/message", data = "<form>")]
fn post(form: Form<Message>, queue: &State<Sender<Message>>) {
    let _res = queue.send(form.into_inner());
}

/*
    retorna uma stream infinita de events enviados pelo server,
    cada event é uma mensagem vinda de um broadcast queue enviado pelo `post`
*/
#[get("/events")]
async fn events(queue: &State<Sender<Message>>, mut end: Shutdown) -> EventStream![] {
    let mut rx = queue.subscribe(); // cria um novo receiver

    EventStream! {
        loop { // loop infinito
            let msg = select! { // aguarda multiplas concurrent "branches" -> (recv e end) e roda qnd uma dessas banches for completada
                msg = rx.recv() => match msg { // aguarda por novas mesagens
                    Ok(msg) => msg,
                    Err(RecvError::Closed) => break, // se não tem mais senders, quebra o loop
                    Err(RecvError::Lagged(_)) => continue, // se o receiver está muito atrás do sender (lagado), pula para a próxima iteração
                },
                _ = &mut end => break, // espera o shutdown resolver
            };

            yield Event::json(&msg);
        }
    }
}


#[launch]
fn rocket() -> _ {
    rocket::build()
        .manage(channel::<Message>(1024).0) // .0 pega o primeiro elemento da tupla que o channel retorna, ou seja, o Sender
        .mount("/", routes![post, events]) // monta as rotas
        .mount("/", FileServer::from(relative!("static")))
}       