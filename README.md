# mqtt-energenie-ener314rt
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-brightgreen.svg)](https://github.com/Achronite/mqtt-energenie-ener314/graphs/commit-activity)
[![Downloads](https://img.shields.io/npm/dm/mqtt-energenie-ener314rt.svg)](https://www.npmjs.com/package/mqtt-energenie-ener314rt)
![node](https://img.shields.io/node/v/mqtt-energenie-ener314rt)
[![Release](https://img.shields.io/github/release-pre/achronite/mqtt-energenie-ener314rt.svg)](https://github.com/Achronite/mqtt-energenie-ener314rt/releases)

[![NPM](https://nodei.co/npm/mqtt-energenie-ener314rt.png)](https://nodei.co/npm/mqtt-energenie-ener314rt/)

MQTT node.js application to control the Energenie line of products via the ENER314-RT add-on board for the Raspberry Pi.

The primary reason this application has been built is to allow integration with [Home Assistant](https://www.home-assistant.io/) etc. via MQTT messaging.

https://energenie4u.co.uk/


## Purpose

This node.js application is designed to run on a Raspberry Pi which has an energenie **ENER314-RT** board installed.

MQTT messages are used to control and monitor the Energenie MiHome radio based smart devices such as adapters, sockets, lights, thermostats and relays (see below for full device list).  This is *instead* of operating the devices using a MiHome Gateway, so this module does not require an internet connection.

There is an alternative node-red implementation by the same author **node-red-contrib-energenie-ener314rt**, for native integration with node-red if you prefer.

The number of individual devices this module can control is over 4 million, so it should be suitable for most installations!

>NOTE: This module does not currently support the older boards (ENER314/Pi-Mote), the Energenie Wifi sockets or the MiHome Gateway.

## Getting Started

1) Plug in your ENER314-RT-VER01 board from Energenie onto the 26 pin or 40 pin connector of your Raspberry Pi.

2) Ensure that the Raspberry Pi is up to date, and has node.js v10+ and npm installed.
For example:
```
sudo apt update
sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -   // latest long term supported release
sudo apt install -y nodejs npm
```
3) Install this application and it's dependencies:
```
npm install mqtt-energenie-ener314rt
```
4) Create/edit `config.json` file in the same directory as the install (mqtt-energenie-ener314rt).
It should contain the following entities configured for your environment:
```
{
  "topic_stub": "energenie/",
  "mqtt_broker": "mqtt://pi3.local",
  "mqtt_options": {
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
* If you are using this module with Home Assistant include the `discovery_prefix` line as above.  The value shown above is the default MQTT discovery topic used by Home Assistant.

5) Run the application manually first using the command: ``node app.js``.  When you know this runs OK a system service can then be set-up as shown in the [Systemd Service](#systemd-service) below.

## Enabling The Hardware based SPI driver
This application works best using the linux hardware based SPI driver (spidev).  The application attempts to open this driver on start-up, if it has not been enabled it falls back to using the software driver. The hardware SPI driver is enabled using `sudo raspi-config` choosing `Interface Options` and `SPI`. Do this whilst this software is not running.  The driver in use is reported within the log on startup.
## Systemd Service
If you want this application to run unattended automatically create a system service by executing the following commands:
```
sudo ln -s /home/pi/mqtt-energenie-ener314rt/mqtt-energenie-ener314rt.service /lib/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start mqtt-energenie-ener314rt
sudo systemctl enable mqtt-energenie-ener314rt
```

To view the log output from the application, use the following command:
```
journalctl -u mqtt-energenie-ener314rt.service
```

## Supported Devices

These nodes are designed for energenie RF radio devices in the OOK & FSK (OpenThings) ranges. 

Here is a table showing the Device Topic and if control, monitoring, [MQTT discovery](#mqtt-discovery) and overall support for each device:


| Device | Description | Device Topic | Control | Monitoring | Discovery | Supported | 
|---|---|:---:|:---:|:---:|:---:|:---:|
|ENER002|Green Button Adapter|ook|Yes|No|No|Yes|
|ENER010|MiHome 4 gang Multiplug|ook|Yes|No|No|Yes|
|MIHO002|MiHome Smart Plug (Blue)|ook|Yes|No|No|Yes|
|MIHO004|MiHome Smart Monitor Plug (Pink)|1|No|Yes|Yes|Yes|
|MIHO005|MiHome Smart Plug+ (Purple)|2|Yes|Yes|Yes|Yes|
|MIHO006|MiHome House Monitor|5|No|Yes|Yes|Yes|
|MIHO007|MiHome Socket (White)|ook|Yes|No|No|Yes|
|MIHO008|MiHome Light Switch (White)|ook|Yes|No|No|Yes|
|MIHO009|MiHome 2 gang Light Switch (White)|ook|Yes|No|No|Yes|
|MIHO010|MiHome Dimmer Switch (White)|ook|Yes|No|No|Yes|
|MIHO013|MiHome Radiator Valve|3|Cached|Yes|Yes|Yes|
|MIHO014|Single Pole Relay (inline)|ook|Yes|No|No|Yes|
|MIHO015|MiHome Relay|ook|Yes|No|No|Yes|
|MIHO021|MiHome Socket (Nickel)|ook|Yes|No|No|Yes|
|MIHO022|MiHome Socket (Chrome)|ook|Yes|No|No|Yes|
|MIHO023|MiHome Socket (Steel)|ook|Yes|No|No|Yes|
|MIHO024|MiHome Light Switch (Nickel)|ook|Yes|No|No|Yes|
|MIHO025|MiHome Light Switch (Chrome)|ook|Yes|No|No|Yes|
|MIHO026|MiHome Light Switch (Steel)|ook|Yes|No|No|Yes|
|MIHO032|MiHome Motion sensor|12|No|Yes|Yes|Yes|
|MIHO033|MiHome Open Sensor|13|No|Yes|Yes|Yes|
|MIHO069|MiHome Heating Thermostat|18|Cached|Yes|No|No| 
|MIHO089|MiHome Click - Smart Button|?|No|Yes|No|No|

## MQTT Topics

The commands and monitor messages are sent/received using MQTT topics.  The topic design is loosely based on that used for esphome devices, and parameter names generally align to the OpenThings parameter standard.

The following table shows some examples of the topics used:

|device|example topic stem|command topic|state topic(s)|valid values|
|---|---|---|---|---|
|MIHO002|energenie/ook/*zone*/*switchNum*|*stem*/command|*stem*/state|ON,OFF|
|MIHO010|energenie/ook/*zone*/dimmer|*stem*/command|*stem*/state|ON,OFF,1-10|
|MIHO004|energenie/1/*deviceNum*|-|*stem*/REAL_POWER/state<br>*stem*/REACTIVE_POWER/state<br>*stem*/VOLTAGE/state<br>*stem*/FREQUENCY/state<br>*stem*/last_seen/state|Number<br>Number<br>Number<br>Float<br>epoch|
|MIHO005|energenie/2/*deviceNum*|*stem*/switch/command|*stem*/switch/state<br>*stem*/REAL_POWER/state<br>*stem*/REACTIVE_POWER/state<br>*stem*/VOLTAGE/state<br>*stem*/FREQUENCY/state<br>*stem*/last_seen/state|ON,OFF<br>Number<br>Number<br>Number<br>Float<br>epoch|
|MIHO006|energenie/5/*deviceNum*|-|*stem*/APPARENT_POWER/state<br>*stem*/VOLTAGE/state<br>*stem*/CURRENT/state<br>*stem*/last_seen/state|Number<br>Float<br>Float<br>epoch|
|MIHO013|*(see eTRV topics below)*||||
|MIHO032|energenie/12/*deviceNum*|-|*stem*/motion/state<br>*stem*/last_seen/state|ON,OFF|
|MIHO033|energenie/13/*deviceNum*|-|*stem*/contact/state<br>*stem*/last_seen/state|ON,OFF<br>epoch|

epoch = Unix timestamp

Other devices will return other OpenThings parameters which you can use. I have provided parameter name and type mapping for the known values for received messages to MQTT topics.

>TIP: You can use an MQTT explorer to show your FSK/OpenThings 'Monitor' devices and their automatically-added reported values.

## Home Assistant Set-up
Enable the [MQTT Integration](https://www.home-assistant.io/integrations/mqtt/) in Home Assistant (if not already enabled).

### MQTT Discovery
Most MiHome Monitor devices will auto-add and be available in Home Assistant via [MQTT discovery](https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery), consult the table above to see if your devices are supported.  The default discovery topics for the devices follow this pattern:
`homeassistant/<component>/ener314rt/<deviceId>-<ParameterName>`

The MQTT discovery configuration is updated one minute after the program starts, and then every 10 minutes thereafter for performance reasons.

>WARNING: Discovery currently bases the availability of OpenThings devices upon the overall availability of this application, it does not currently work to the device level (see #19 for latest)

### MQTT Manual setup
For other devices (particularly the 'Control Only' devices) you will **need to add them manually** by editting your Home Assistant `configuration.yaml` file for lights, dimmers, switches and reported values as applicable. For example:
```
mqtt:
  light:
    - unique_id: MIHO008_light1
      name: "Lounge Light Switch"
      command_topic: energenie/ook/87/1/command
      optimistic: false
      state_topic: energenie/ook/87/1/state
      availability_topic: energenie/availability/state

  switch:
    - unique_id: ENER002_socket
      name: "Coffee Maker"
      command_topic: energenie/ook/89/1/command
      optimistic: false
      state_topic: energenie/ook/89/1/state
      availability_topic: energenie/availability/state

    - unique_id: ENER010_socket_2
      name: "Subwoofer"
      command_topic: energenie/ook/564/2/command
      optimistic: false
      state_topic: energenie/ook/564/2/state
      availability_topic: energenie/availability/state

    - unique_id: MIHO010_Dimmer1
      name: "Kitchen Dimmer Switch"
      command_topic: energenie/ook/669/dimmer/command
      state_topic: energenie/ook/669/dimmer/state
      state_value_template: "{{ 'OFF' if value == 'OFF' else 'ON' }}"
      brightness_state_topic: energenie/ook/669/dimmer/state
      brightness_command_topic: energenie/ook/669/dimmer/command
      brightness_scale: 10
      payload_on: 'ON'
      payload_off: 'OFF'
      on_command_type: "brightness"
      optimistic: false
      availability_topic: energenie/availability/state

  sensor:
    - name: "MiHome Thermometer Temperature"
      state_topic: energenie/18/12345/TEMPERATURE/state
      device_class: temperature
      unit_of_measurement: "C"

```
>TIP: If you do not know the existing zone and switch number for any of your 'Control Only' (Blue) devices you can 're-teach' the device...


### Energenie 'Control Only' OOK device teaching in Home Assistant
The control only devices (any listed in the above table as Device Topic 'ook' or with a Blue icon on the energenie boxes) need to be taught a zone and switch code.

1. Add an `mqtt` entry in `configuration.yaml` for your switch or light. These should uniquely reference your device (following the OOK zone rules below).  For example to teach an ENER002 socket to be Zone `567` switch `1` enter the following:
```
mqtt:
  switch:
    - name: "My Switch"
      command_topic: energenie/ook/567/1/command
      optimistic: false
      state_topic: energenie/ook/567/1/state
```
2. Reload the YAML configuration `MANUALLY CONFIGURED MQTT ENTITIES` in Home Assistant Developer Tools
3. Hold the button on your device until it starts to flash (holding longer clears any previous codes; each device can usually have 2 separate codes).
4. Click the power on button on the dashboard for your new switch/light device.  This will send an MQTT message to this application, which will send a power-on request for the zone/switch combination set in the command topic.
5. The device should learn the zone code being sent by the power-on request, the light should stop flashing when successful.
6. All subsequent calls using the same zone/switch number will cause your device to switch.

## 'Control Only' OOK Zone Rules
* Each Energenie **'Control'** or OOK based device can be assigned to a specifc zone (or house code) and a switch number.
* Each zone is encoded as a 20-bit address (1-1048575 decimal).
* Each zone can contain up to 6 separate switches (1-6) - NOTE: officially energenie state this is only 4 devices (1-4)
* All devices within the **same** zone can be switched **at the same time** using a switch number of '0'.
* A default zone '0' can be used to use Energenie's default zone (0x6C6C6).

## MiHome Radiator Valve (eTRV) Support
MiHome Thermostatic Radiator valves (eTRV) are supported, but due to the way the eTRV works there may be a delay from when a command is sent to it being processed by the device. See **Command Caching** below.

### eTRV Commands
The MiHome Thermostatic Radiator valve (eTRV) can accept commands to perform operations, provide diagnostics or perform self tests.  The documented commands are provided in the table below.  For this MQTT implementation most of the commands have been simplified under a single 'Maintenance' topic.  If you are using MQTT Discovery in Home Assistant you should see a 'select' for this on your dashboard.

Where .data shows an entry in "", this is the string that should be sent as the 'Command' for the MQTT Maintenance topic. This can be used if you want to send a request without using the select dropdown set-up by MQTT discovery.

| Command | MQTT Command Topic(s) | # | Description | .data | Response Msg |
|---|:---:|---|---|:---:|---|
|Clear|Maintenance|0|Cancel current outstanding cached command for the device (set command & retries to 0)| "Cancel Command"|All Msgs|
|Exercise Valve|Maintenance EXERCISE_VALVE|163|Send exercise valve command, recommended once a week to calibrate eTRV|"Exercise Valve"|DIAGNOSTICS|
|Low power mode|Maintenance LOW_POWER_MODE|164|This is used to enhance battery life by limiting the hunting of the actuator, ie it limits small adjustments to degree of opening, when the room temperature is close to the *TEMP_SET* point. A consequence of the Low Power mode is that it may cause larger errors in controlling room temperature to the set temperature.|0=Off<br>1=On OR "Low Power Mode ON" "Low Power Mode OFF"|No*|
|Valve state|Maintenance<br>VALVE_STATE|165|Set valve state|"Valve Auto"<br>"Valve Open"<br>"Valve Closed"<br> OR 0=Open<br>1=Closed<br>2=Auto (default)|No|
|Diagnostics|Maintenance<br>DIAGNOSTICS|166|Request diagnostic data from device, if all is OK it will return 0. Otherwise see additional monitored values for status messages|"Request Diagnostics"|DIAGNOSTICS|
|Identify|Maintenance<br>IDENTIFY|191|Identify the device by making the green light flash on the selected eTRV for 60 seconds|"Identify"|No|
|Reporting Interval|Maintenance REPORTING_INTERVAL|210|Update reporting interval to requested value|300-3600 seconds|No|
|Voltage|Maintenance<br>VOLTAGE|226|Report current voltage of the batteries||VOLTAGE|
|Target temperature|TARGET_TEMP|244|Send new target temperature for eTRV.<br>NOTE: The VALVE_STATE must be set to 'Auto' for this to work.|5-40<br>(Integer)|No|

> \* Although this will not auto-report, a subsequent call to *REQUEST_DIAGNOTICS* will confirm the *LOW_POWER_MODE* setting

### Command Caching
Battery powered energenie devices, such as the eTRV or Thermostat do not constantly listen for commands.  For example, the eTRV reports its temperature at the *SET_REPORTING_INTERVAL* (default 5 minutes) after which the receiver is then activated to listen for commands. The receiver only remains active for 200ms or until a message is received.

To cater for these hardware limitations a command will be held until a report is received by the monitor thread from the device; at this point the most recent cached message (only 1 is supported) will be sent to the device.  Messages will continue to be resent until we know they have been succesfully received or until the number of retries has reached 0.  When a command is known to have been processed (e.g DIAGNOSTICS) the 'command' and 'retries' topics are reset to 0.

The reason that a command may be resent multiple times is due to reporting issues. The eTRV devices, unfortunately, do not send acknowledgement for every command type (indicated by a 'No' in the *Response Msg* column in the above table).  This includes the *TEMP_SET* command!  So these commands are always resent for the full number of retries.

> **NOTE:** The performance of node may decrease when a command is cached due to dynamic polling. The frequency that the radio device is polled by the monitor thread automatically increases by a factor of 200 when a command is cached (it goes from checking every 5 seconds to every 25 milliseconds) this dramatically increases the chance of a message being correctly received sooner.

### eTRV Topics

To support the MiHome Radiator Valve (MIHO013) aka **'eTRV'**, additional code has been added to also cache the monitor information for these devices.  Examples of the values are shown below, only 'known' values are returned when the eTRV regularly reports.

|Parameter|Description|Topics|Data|Discovery Type|
|---|---|:---:|:---:|:---:|
|Maintenance|For sending maintenance commands|state,command|None, Cancel Command, Request Diagnostics, Exercise Valve, Identify, Low Power Mode ON, Low Power Mode OFF, Valve Auto, Valve Open,Valve Closed|select|
|command|Current cached command being set to eTRV|state,command|None,...|sensor|
|retries|The number of remaining retries for 'command' to be sent to the device|state,*soon*|0-10|sensor|
|DIAGNOSTICS|Numeric diagnostic code|state|Numeric||
|ERRORS|true if an error condition has been detected|state||binary_sensor|
|ERROR_TEXT|error information|state|text|sensor|
|EXERCISE_VALVE|The result of the *EXERCISE_VALVE* command|state|success, fail|binary_sensor|
|LOW_POWER_MODE|eTRV is in low power mode state>|state|ON, OFF|binary_sensor|
|REPORTING_INTERVAL|Frequency the eTRV will work up and report (in seconds)|command|300-3600|Number|
|TARGET_TEMP|Target temperature in celcius|command|5-40|Number|
|TEMPERATURE|The current temperature in celcius|state|float|sensor|
|VALVE_STATE|Current valve mode/state|state|Auto, Open, Closed|sensor|
|VOLTAGE|Current battery voltage|state|float|sensor|

## Change History
See [CHANGELOG.md](./CHANGELOG.md)


## Built With

* [NodeJS](https://nodejs.org/dist/latest-v10.x/docs/api/) - JavaScript runtime built on Chrome's V8 JavaScript engine.
* [energenie-ener314rt](https://github.com/Achronite/energenie-ener314rt) - Dependant node.js module that performs all energenie functions
* [mqtt](https://github.com/mqttjs) - javascript implementation of MQTT protocol

## Authors

* **[Achronite](https://github.com/Achronite/mqtt-energenie-ener314rt)** - *MQTT implementation and dependant Node module* - 

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## This project needs your help!
I have performed all work to date on this open source, free, software without any help (financial or otherwise) from energenie. Your support provides increased motivation to work on future releases and new features. You can help by sponsoring my work on [GitHub Sponsors](https://github.com/sponsors/Achronite) (one-time/monthly, no service fee).

<a href="https://github.com/sponsors/Achronite" target="_blank" title="Become a sponsor">
<img src="https://img.shields.io/badge/Github-@Achronite-24292e.svg?maxAge=3600&logo=github" height="25" alt="Become a sponsor">
</a>

Thank you for your support!

## Bugs and Future Work

Future work is detailed on the [github issues page](https://github.com/Achronite/mqtt-energenie-ener314rt/issues). Please raise any bugs, questions, queries or enhancements you have using this page.

https://github.com/Achronite/mqtt-energenie-ener314rt/issues


@Achronite - January 2023