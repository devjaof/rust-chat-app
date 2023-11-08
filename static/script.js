const roomListDiv = document.getElementById('room-list');
const messagesDiv = document.getElementById('messages');
const newMessageForm = document.getElementById('new-message');
const newRoomForm = document.getElementById('new-room');
const statusDiv = document.getElementById('status');

const roomTemplate = document.getElementById('room');
const messageTemplate = document.getElementById('message');

const messageField = newMessageForm.querySelector('#message');
const usernameField = newMessageForm.querySelector('#username');
const roomNameField = newRoomForm.querySelector('#name');

const STATE = {
  currentRoom: 'Inicio',
  connected: false,
};

const changeRoom = (room) => {
  if (STATE.currentRoom === room) return;

  const newRoom = roomListDiv.querySelector(`.room[data-name='${room}']`);
  const oldRoom = roomListDiv.querySelector(
    `.room[data-name='${STATE.currentRoom}']`
  );

  if (!newRoom || !oldRoom) return;

  STATE.currentRoom = room;
  oldRoom.classList.remove('active');
  newRoom.classList.add('active');

  messagesDiv.querySelectorAll('.message').forEach((msg) => {
    messagesDiv.removeChild(msg);
  });

  STATE[room].forEach((data) =>
    sendMessageToRoom({ room, username: data.username, message: data.message })
  );
};

function createRoom(name) {
  if (STATE[name]) {
    changeRoom(name);
    return false;
  }

  const node = roomTemplate.content.cloneNode(true);
  const room = node.querySelector('.room');
  room.addEventListener('click', () => changeRoom(name));
  room.textContent = name;
  room.dataset.name = name;
  roomListDiv.appendChild(node);

  STATE[name] = [];
  changeRoom(name);
  return true;
}

function sendMessageToRoom({
  room,
  username,
  message,
  pushToOtherRoom = false,
}) {
  if (pushToOtherRoom) {
    STATE[room].push({ username, message });
  }

  if (STATE.currentRoom === room) {
    const node = messageTemplate.content.cloneNode(true);

    node.querySelector('.message .username').textContent = username;
    node.querySelector('.message .username').style.color = '#32a852';
    node.querySelector('.message .text').textContent = message;
    messagesDiv.appendChild(node);
  }
}

function subscribeToUrl(url) {
  let retryTime = 1;

  // EventSource é usado para receber eventos enviados pelo servidor.
  // Ele se conecta via HTTP em um servidor e recebe eventos com o formato text/event-stream.
  const events = new EventSource(url);

  events.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const { message, room, username } = msg;

    if (!message || !room || !username) {
      return;
    }

    sendMessageToRoom({ room, username, message, pushToOtherRoom: true });
  });

  events.addEventListener('open', () => {
    setConnectedStatus(true);
    console.log(`conectado ao event stream em ${url}`);
    retryTime = 1;
  });

  events.addEventListener('error', () => {
    setConnectedStatus(false);
    events.close();

    const timeout = retryTime;
    retryTime = Math.min(64, retryTime * 2);
    console.log(`conexão perdida. tentando conectar novamente em ${timeout}s`);
    setTimeout(() => subscribeToUrl(url), (() => timeout * 1000)());
  });
}

function setConnectedStatus(status) {
  STATE.connected = status;
  statusDiv.className = status ? 'connected' : 'reconnecting';
}

function init() {
  createRoom('Inicio');
  sendMessageToRoom({
    room: 'Inicio',
    username: 'O Criador',
    message: 'Abra outra aba e sinta o poder',
    pushToOtherRoom: true,
  });

  // setup dos forms
  newMessageForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const room = STATE.currentRoom;
    const message = messageField.value;
    const username = usernameField.value || 'Anônimo';
    if (!message || !username) return;

    if (STATE.connected) {
      fetch('/message', {
        method: 'POST',
        body: new URLSearchParams({ room, username, message }),
      }).then((response) => {
        if (response.ok) messageField.value = '';
      });
    }
  });

  newRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const room = roomNameField.value;
    if (!room) return;

    roomNameField.value = '';
    if (!createRoom(room)) return;

    sendMessageToRoom({
      room,
      username: 'O Criador',
      message: 'Olha só, uma sala novinha! Nice.',
      pushToOtherRoom: true,
    });
  });

  subscribeToUrl('/events');
}

init();
