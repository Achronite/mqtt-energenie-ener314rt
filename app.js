//
//

// import config from file
const CONFIG = require('./config.json');

//console.log(CONFIG);

const MQTT_SUBTOPIC = CONFIG.topic_stub + "+/+/+/command";
const MQTTM_DEVICE = 1;
const MQTTM_OOK_ZONE = 2;
const MQTTM_OOK_SWITCH = 3;
const MQTTM_OT_PRODUCTID = 1;
const MQTTM_OT_DEVICEID = 2;
const MQTTM_OT_CMD = 3;

var mqtt = require('mqtt');

// import my dependant node.js module
var ener314rt = require('energenie-ener314rt');

// import async processing for handling radio comms
const { fork } = require('child_process');

// TODO swap these for config
//const CONFIG.mqtt.broker = "mqtt://pi3.local";
const MQTT_OPTIONS = { clientId: CONFIG.mqtt.clientId,
					username:CONFIG.mqtt.username,
					password:CONFIG.mqtt.password,
					clean:true};

// connect to MQTT
var client = mqtt.connect(CONFIG.mqtt.broker,MQTT_OPTIONS);
console.log("connected flag  " + client.connected);

//handle incoming MQTT messages
client.on('message',function(topic, msg, packet){
	console.log("MQTT cmd topic=" + topic + ": "+ msg);

	// format command for passing to energenie process
	// format is OOK: 'energenie/c/ook/zone/switchNum/command' or OT: 'energenie/c/2/deviceNum/command'
	const cmd_array = topic.split("/");

	switch ( cmd_array[MQTTM_DEVICE]) {
		case 'ook':
		case 'OOK':
		case 'o':
			// All ook 1-way devices
			
			//validate on/off request, default to OFF
			var switchState = false;
			if (typeof msg == typeof true)
				switchState = msg;
			else if (msg == "ON" || msg == "on" || msg == 1 || msg == '1')
				switchState = true;
			var ener_cmd = { cmd: 'send', mode: 'ook', zone: cmd_array[MQTTM_OOK_ZONE], switchNum: cmd_array[MQTTM_OOK_SWITCH], switchState: switchState};
			break;
		case '2':
		case 2:
			// MIHO005 - Adaptor+

			//validate on/off request, default to OFF
			var switchState = false;
			if (typeof msg == typeof true)
				switchState = msg;
			else if (msg == "ON" || msg == "on" || msg == 1 || msg == '1')
				switchState = true;
			var ener_cmd = { cmd: 'send', mode: 'fsk', command: 'switch',
					productId: cmd_array[MQTTM_OT_PRODUCTID],
					deviceId: cmd_array[MQTTM_OT_DEVICEID],
					switchState: switchState};
			break;



	}

	if (ener_cmd !== undefined){
		// Send request to energenie process, any responses are handled by forked.on('message')
		console.log("sending "+ JSON.stringify(ener_cmd));
		forked.send(ener_cmd);
	}
});


/*
** When MQTT is connected, subscribe to the command topic(s)
*/
client.on('connect',function(){	
	console.log("MQTT connected  "+ client.connected);

	// start the monitor loop if configured in config file
	if (CONFIG.monitoring){
		console.log("starting monitoring of FSK devices...")
		forked.send({ cmd: "monitor", enabled: true });
	}

	// Subscribe to incoming commands
	var options={
		retain:true,
		qos:0};
	
	var cmd_topic= MQTT_SUBTOPIC;
	//var cmd_topic="esphome/sensors/dht11/#";
	//console.log("subscribing to ",cmd_topic);
	client.subscribe(cmd_topic,options, function( err ) {
		if (!err){
			console.log("subscribed to ",cmd_topic);
		} else {
			// error
		}
	});

})


//handle MQTT errors
client.on('error',function(error){
	console.log("Can't connect to MQTT " + error);
	process.exit(1)
});


// fork energenie process
const forked = fork("energenie.js");

/*
** Handle monitor/results messages returned by energenie
*/
forked.on("message", msg => {
	// we have a monitor or ACK message, transform into MQTT message
    //console.log("Message from energenie process: ", msg);

	// format state topic string
	// TODO: deal with multiple return values for FSK
	switch (msg.cmd){
		case 'send':
			var rtn_msg = "UNKNOWN";
			var state_topic;
			switch (msg.mode) {
				case 'ook':
					state_topic = `${CONFIG.topic_stub}ook/${msg.zone}/${msg.switchNum}/state`;
					
					if (typeof(msg.state) === 'boolean'){
						if (msg.state) {
							rtn_msg = "ON";
						} else {
							rtn_msg = "OFF";
						}
					}
					// send single response back via MQTT state topic
					console.log("publishing ", state_topic, ": ", rtn_msg);
					client.publish(state_topic,rtn_msg);
					break;

				case 'fsk':
					// TODO allow for multiple parameters being returned
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/${msg.command}/state`;
					
					if (typeof(msg.state) === 'boolean'){
						if (msg.state) {
							rtn_msg = "ON";
						} else {
							rtn_msg = "OFF";
						}
					} else {
						// only allows for single param, may need to change if using JSON
						rtn_msg = msg.state;
					}

					// send single response back via MQTT state topic
					console.log("publishing ", state_topic, ": ", rtn_msg);
					client.publish(state_topic,rtn_msg);

					break;
				
			} // switch 'send' msg.mode


			break;
		case 'monitor':
			// OpenThings monitor message

			// iterate through the object returned

			let keys = Object.keys(msg);
			var productId = null;
			var deviceId = null;

			keys.forEach((key) => {
				topic_key = null;
				//console.log(`key ${key}=${msg[key]}`);
				switch (key) {
					case 'productId':
					case 'deviceId':
					case 'mfrId':
					case 'timestamp':
					case 'cmd':
						break;
					case 'SWITCH_STATE':
						// use friendly name and value
						topic_key = 'switch';
						if (msg[key] == 1 || msg[key] == '1') {
							msg[key] = "ON";
						} else {
							msg[key] = "OFF";
						}

						break;
					case 'MOTION_DETECTOR':
						topic_key = 'motion';
						if (msg[key] == 1 || msg[key] == '1') {
							msg[key] = "ON";
						} else {
							msg[key] = "OFF";
						}
						break;
					default:
						// assume an unknown key we need to set in topic tree
						topic_key = key;							
				}

				// send MQTT if we have a valid topic string
				if (topic_key !== null && msg.productId !== undefined && msg.deviceId !== undefined) {
					state_topic = `${CONFIG.topic_stub}${msg.productId}/${msg.deviceId}/${topic_key}/state`;
					state = String(msg[key]);

					// send response back via MQTT state topic
					console.log("publishing ", state_topic, ": ", state);
					client.publish(state_topic,state);
				}
			})

			break;


		case 'init':
		case 'reset':
			break;
	} // switch msg.cmd

	//{ cmd: 'send', mode: 'ook', zone: cmd_array[MQTTM_OOK_ZONE], switchNum: cmd_array[MQTTM_OOK_SWITCH], switchState: switchState};

});


forked.on('close', (code, signal) => {
    console.log(`parent: child process has terminated due to receipt of signal ${signal}`);
    // clear interval timer (causes program to exit as nothing left to do!)
    clearInterval(intervalId);
});


// DEBUG: every now and again ask the child to send a message
/*
var intervalId = setInterval(() => {
    forked.send({ cmd: "send" });
}, 10000);
*/

// ask trv to report diags
/*
var id2 = setInterval(() => {
    //forked.send({ cmd: "close" });
    //forked.send({ cmd: "monitor", enabled: false });
    forked.send({cmd: "cacheCmd",
        otCommand: 166,
        data: 0,
        deviceId: 3989 });
}, 450000);
*/


