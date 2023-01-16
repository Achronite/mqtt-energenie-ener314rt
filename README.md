# mqtt-energenie-ener314rt
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-brightgreen.svg)](https://github.com/Achronite/mqtt-energenie-ener314/graphs/commit-activity)
<!--
[![Downloads](https://img.shields.io/npm/dm/mqtt-energenie-ener314rt.svg)](https://www.npmjs.com/package/mqtt-energenie-ener314rt)
[![HitCount](http://hits.dwyl.io/achronite/mqtt-energenie-ener314rt.svg)](http://hits.dwyl.io/achronite/mqtt-energenie-ener314rt)
![node](https://img.shields.io/node/v/mqtt-energenie-ener314rt)
[![Release](https://img.shields.io/github/release-pre/achronite/mqtt-energenie-ener314rt.svg)](https://github.com/Achronite/mqtt-energenie-ener314rt/releases)
[![NPM](https://nodei.co/npm/mqtt-energenie-ener314rt.png)](https://nodei.co/npm/mqtt-energenie-ener314rt/)
--->

MQTT node.js application to control the Energenie line of products via the ENER314-RT add-on board for the Raspberry Pi.

The primary reason this application has been built is to allow integration with [Home Assistant](https://www.home-assistant.io/) etc. via MQTT messaging.

https://energenie4u.co.uk/


## WARNING: THIS REPOSITORY IS UNDER ACTIVE DEVELOPMENT
>I am still actively developing this node.js application.

>There are currently lots of DEBUGs in the code and it has yet to be npm or github packaged for release, but the basic code is working as intended and I welcome any testers.  Please provide any feedback in [issues](https://github.com/Achronite/mqtt-energenie-ener314rt/issues)

## Purpose

You can use this node.js application to control and monitor the Energenie MiHome radio based smart devices such as adapters, sockets, lights, thermostats and relays using MQTT messages on a Raspberry Pi with an **ENER314-RT** board installed (see below for full device list).  This is *instead* of operating the devices using a MiHome Gateway, so this module does not require an internet connection.

There is also a node-red implementation by the same author **node-red-contrib-energenie-ener314rt**, for native integration with node-red.

The number of individual devices this module can control is over 4 million, so it should be suitable for most installations!

>NOTE: This module does not currently support the older boards (ENER314/Pi-Mote), the Energenie Wifi sockets or the MiHome Gateway.



## Getting Started

1) Plug in your ENER314-RT-VER01 board from Energenie onto the 26 pin or 40 pin connector of your Raspberry Pi.

2) Ensure that the Raspberry Pi is up to date, and has node.js v10+ or above installed.
For example:
```
sudo apt update
sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -   // latest long term supported release
sudo apt install -y nodejs npm
```
3) Install the dependant node modules 'mqtt' and 'energenie-ener314rt'
```
cd mqtt-energenie-ener314rt
npm install mqtt --save
npm install energenie-ener314rt --save
```
4) Create/edit `config.json` file in the same directory as the install.
It should contain the following entities:
```
{
    "topic_stub": "energenie/",
    "mqtt_broker": "mqtt://pi3.local",
    "mqtt_options": {
        "clientId": "node-ener314rt", 
        "username":"node-ener314rt",
        "clean": true
    },
    "monitoring": true,
    "discovery_prefix": "homeassistant/"
}
```
* `topic_stub` should contain the base topic where your energenie messages should reside on mqtt, the default value should suit most installations.
* `mqtt_broker` should contain your MQTT broker address and protocol.
* Modify the `mqtt_options` section with your [MQTT client options](https://github.com/mqttjs/MQTT.js#client), such as username, password, certificate etc.
* If you have any energenie 'Control & Monitor' or 'Monitor' devices then set `"monitoring": true` otherwise remove or set false.

5) Run the application manually using the command: ``node app.js``
 
## Systemd Service

Execute the following commands:
```
sudo ln -s /home/pi/mqtt-energenie-ener314rt/mqtt-energenie-ener314rt.service /lib/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start mqtt-energenie-ener314rt
sudo systemctl enable mqtt-energenie-ener314rt
```

To view the logs output from the application, use the following command:
```
journalctl -u mqtt-energenie-ener314rt.service
```

## Supported Devices

These nodes are designed for energenie RF radio devices in the OOK & FSK (OpenThings) ranges.

Here is a table showing the Device Topic and if control and monitoring is supoported for each device:

| Device | Description | Device Topic | Control | Monitoring | Supported |
|---|---|:---:|:---:|:---:|:---:|
|ENER002|Green Button Adapter|ook|Yes|No|Yes|
|ENER010|MiHome 4 gang Multiplug|ook|Yes|No|Yes|
|MIHO002|MiHome Smart Plug (Blue)|ook|Yes|No|Yes|
|MIHO004|MiHome Smart Monitor Plug (Pink)|1|No|Yes|Yes|
|MIHO005|MiHome Smart Plug+ (Purple)|2|Yes|Yes|Yes|
|MIHO006|MiHome House Monitor|5|No|Yes|Yes|
|MIHO007|MiHome Socket (White)|ook|Yes|No|Yes|
|MIHO008|MiHome Light Switch (White)|ook|Yes|No|Yes|
|MIHO009|MiHome 2 gang Light Switch (White)|ook|Yes|No|Yes|
|MIHO010|MiHome Dimmer Switch (White)|ook|Yes|No|*soon*|
|MIHO013|MiHome Radiator Valve|3|Cached|Yes|*soon*|
|MIHO014|Single Pole Relay (inline)|ook|Yes|No|Yes|
|MIHO015|MiHome Relay|ook|Yes|No|Yes|
|MIHO021|MiHome Socket (Nickel)|ook|Yes|No|Yes|
|MIHO022|MiHome Socket (Chrome)|ook|Yes|No|Yes|
|MIHO023|MiHome Socket (Steel)|ook|Yes|No|Yes|
|MIHO024|MiHome Light Switch (Nickel)|ook|Yes|No|Yes|
|MIHO025|MiHome Light Switch (Chrome)|ook|Yes|No|Yes|
|MIHO026|MiHome Light Switch (Steel)|ook|Yes|No|Yes|
|MIHO032|MiHome Motion sensor|12|No|Yes|Yes|
|MIHO033|MiHome Open Sensor|13|No|Yes|Yes|
|MIHO069|MiHome Heating Thermostat|18|Cached|Yes|No| 
|MIHO089|MiHome Click - Smart Button|?|No|Yes||

## MQTT Topics

The commands and monitor messages are sent/received using MQTT topics.  The topic design is loosely based on that used for esphome devices, and parameter names generally align to the OpenThings parameter standard.

The following table shows some examples of the topics used:

|device|example topic stem|command topic|state topic(s)|valid values|
|---|---|---|---|---|
|Control only|energenie/ook/*zone*/*switchNum*|*stem*/command|*stem*/state|ON,OFF|
|MIHO004|energenie/1/*deviceNum*|-|*stem*/REAL_POWER/state<br>*stem*/REACTIVE_POWER/state<br>*stem*/VOLTAGE/state<br>*stem*/FREQUENCY/state|Number<br>Number<br>Number<br>Float|
|MIHO005|energenie/2/*deviceNum*|*stem*/switch/command|*stem*/switch/state<br>*stem*/REAL_POWER/state<br>*stem*/REACTIVE_POWER/state<br>*stem*/VOLTAGE/state<br>*stem*/FREQUENCY/state|ON,OFF<br>Number<br>Number<br>Number<br>Float|
|MIHO006|energenie/5/*deviceNum*|-|*stem*/APPARENT_POWER/state<br>*stem*/VOLTAGE/state<br>*stem*/CURRENT/state|Number<br>Float<br>Float|
|MIHO032|energenie/12/*deviceNum*|-|*stem*/motion/state|ON,OFF|
|MIHO033|energenie/13/*deviceNum*|-|*stem*/contact/state|ON,OFF|

For example the 'Smart Plug+' populates the following topics in MQTT:
```
    "switch/state": <ON/OFF value received from plug>
    "REAL_POWER/state": <power in Watts being consumed>
    "REACTIVE_POWER/state": <Power in volt-ampere reactive (VAR)>
    "VOLTAGE/state": <Power in Volts>            
    "FREQUENCY/state": <Radio Frequency in Hz>
```
Other devices will return other parameters which you can use. I have provided parameter name and type mapping for the known values for received messages to MQTT topics, please use an MQTT explorer to find ones to use.

A full parameter list can be found in C/src/achronite/openThings.c if required.


## Home Assistant Set-up
Enable the [MQTT Integration](https://www.home-assistant.io/integrations/mqtt/) in Home Assistant (if not already enabled).

Some devices will now auto-add and be available in Home Assistant via MQTT discovery.  The default discovery topics for the devices follow the pattern:
`homeassistant/<component>/ener314rt/<deviceId>-<ParameterName>`

For other devices (particularly the 'Control Only' devices) you will need to add them manually by editting your Home Assistant `configuration.yaml` file for the switches and reported values as applicable. For example:
```
mqtt:
  light:
    - unique_id: test_light
      name: "Test MQTT Light"
      command_topic: energenie/ook/87/1/command
      optimistic: false
      state_topic: energenie/ook/87/1/state

    - unique_id: tree_lights
      name: "Christmas Tree lights"
      command_topic: energenie/ook/88/2/command
      optimistic: false
      state_topic: energenie/ook/88/2/state

  sensor:
    - name: "eTRV Temperature"
      state_topic: energenie/3/12345/TEMPERATURE/state
      device_class: temperature
      unit_of_measurement: "C"

```
>NOTE: If you have an 'Control' (Blue) devices these will need to be added manually by teaching the device code (see below)

>TIP: You can use an MQTT explorer to show the auto-discovered OpenThings 'Monitor' devices reported values.

### Energenie 'Control Only' OOK device teaching in Home Assistant
The control only devices (any listed in the above table as Device Topic 'ook' or with a Blue icon on the energenie boxes) need to be taught a zone and switch code.

1. Add an mqtt entry in `configuration.yaml` for your switch or light. These should uniquely reference your device (following the OOK zone rules below).  For example to teach an ENER002 socket to be Zone 567 switch 1 enter the following:
```
mqtt:
  switch:
    - name: "My Switch"
      command_topic: energenie/ook/567/1/command
      optimistic: false
      state_topic: energenie/ook/567/1/state
```
2. Refresh the MQTT configuration in Home Assistant
3. Hold the button on your device until it starts to flash (holding longer clears the learnt codes).
4. Click the power on button on the dashboard for your device.  This will send an MQTT message to this application, which will send a power-on request for the zone/switch combination set in the command topic.
5. The device should learn the zone code being sent by the power-on request, the light should stop flashing when successful.
6. All subsequent calls using the same zone/switch number will cause your device to switch.

## 'Control Only' OOK Zone Rules
* Each Energenie **'Control'** or OOK based device can be assigned to a specifc zone (or house code) and a switch number.
* Each zone is encoded as a 20-bit address (1-1048575 decimal).
* Each zone can contain up to 6 separate switches (1-6) - NOTE: officially energenie state this is only 4 devices (1-4)
* All devices within the **same** zone can be switched **at the same time** using a switch number of '0'.
* A default zone '0' can be used to use Energenie's default zone (0x6C6C6).

## Change History
See [CHANGELOG.md](./CHANGELOG.md)


## Built With

* [NodeJS](https://nodejs.org/dist/latest-v10.x/docs/api/) - JavaScript runtime built on Chrome's V8 JavaScript engine.
* [energenie-ener314rt](https://github.com/Achronite/energenie-ener314rt) - Dependant node.js module that performs all energenie functions
* [mqtt](https://github.com/mqttjs) - javascript implementation of MQTT protocol

## Authors

* **Achronite** - *MQTT implementation and dependant Node module* - [Achronite](https://github.com/Achronite/mqtt-energenie-ener314rt)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Bugs and Future Work

Future work is detailed on the [github issues page](https://github.com/Achronite/mqtt-energenie-ener314rt/issues). Please raise any bugs, questions, queries or enhancements you have using this page.

https://github.com/Achronite/mqtt-energenie-ener314rt/issues


@Achronite - January 2023 - v0.1.0 Alpha