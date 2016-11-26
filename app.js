'use strict';
const ENV = process.env;

const mqtt = require('mqtt');
const client  = mqtt.connect(ENV.MQTT);
var ThingSpeakClient = require('thingspeakclient');
var clientTS = new ThingSpeakClient();
const telegram = require('telegram-bot-api');

const OWNER_ID = ENV.OWNER_ID;
const WIFE_ID = ENV.WIFE_ID;
const CHANNEL_ID = ENV.CHANNEL_ID; 

const TIME_ZONE = 3 * 60 * 60 * 1e3;
const users = new Map();

const api = new telegram({
  token: ENV.TELEGRAM_KEY,
  updates: {
    enabled: true
  }
});

clientTS.attachChannel(CHANNEL_ID, { writeKey: ENV.WRITE_KEY, readKey: ENV.READ_KEY });

var pos;

function parseDate(date) {
  return {
    day: `${date.getDate()}.${date.getMonth()}.${date.getFullYear()}`,
    time: `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
  };
}

function getFullDate(tst) {
  let now = parseDate(new Date(Date.now() + TIME_ZONE));
  let date = parseDate(new Date(tst + TIME_ZONE));
    
  return `${ now.day === date.day ? '' : date.day + ' '}${date.time}`;
}

client.on('connect', function () {
  client.subscribe(ENV.TOPIC, function() {
    client.on('message', function(topic, message, packet) {
      message = JSON.parse(message);
      
      console.log(message);
      if (message._type !== 'location') { return; }
      
      pos = message;
      pos.tst *= 1e3;
      
      pos.batt && clientTS.updateChannel(CHANNEL_ID, { field4: pos.batt });
    });
  });
});

api.on('message', function(msg) {
  var msgText = msg.text,
    from = msg.from,
    fromId = from.id,
    text = '';
  
  console.log(fromId, OWNER_ID);
  fromId != OWNER_ID && api.sendMessage({
    chat_id: OWNER_ID,
    text: JSON.stringify(msg, null, 4)
  });
  
  if (msgText && msgText.indexOf('/where') === 0 && pos && (fromId == OWNER_ID || fromId == WIFE_ID)) {
    api.sendMessage({
      chat_id: fromId,
      text: `${getFullDate(pos.tst)} был тут.`
    });
    
    api.sendLocation({
      chat_id: fromId,
      latitude: pos.lat,
      longitude: pos.lon
    });
    
    return;
  }

  if (msgText === '/reset') {
    users.delete(fromId);
    api.sendMessage({
      chat_id: msg.chat.id,
      text: 'Счётчик обращений сброшен.'
    });
    return;
  }
  
  if (msgText && msgText.indexOf('/') === 0) {
  // if (msgText) {
    users.set(fromId, 1 + (users.get(fromId) || 0));
    
    text += 'Текущий запрос такой:\n';
    text += JSON.stringify(msg, null, 4);
    
    api.sendMessage({
      chat_id: msg.chat.id,
      text: text
    });
    return;
  }
  
  if (!users.has(fromId)) {
    text += `Привет ${from.username || from.first_name || 'anonymus'}!\n\n`;
    text += 'Если написать что-то, начинающееся с обратного слеша, например /foo, то в ответе придет json запроса.\n';
    text += 'Или /reset, чтобы сбросить счётчик посещений.';
  } else {
    text += `О, да ты мне уже писал, голубчик, *${users.get(fromId)}* раз/раза.\n\n`;
  }
  
  users.set(fromId, 1 + (users.get(fromId) || 0));
    
  api.sendMessage({
    chat_id: msg.chat.id,
    text: text,
    parse_mode: 'Markdown'
  });
});