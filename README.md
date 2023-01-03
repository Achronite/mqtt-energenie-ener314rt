# mqtt-energenie-ener314rt

MQTT node.js application to control the Energenie line of products via the ENER314-RT add-on board for the Raspberry Pi.

The primary reason this application has been built is to allow integration with [Home Assistant](https://www.home-assistant.io/) etc. via MQTT messaging.

https://energenie4u.co.uk/

[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-brightgreen.svg)](https://github.com/Achronite/mqtt-energenie-ener314/graphs/commit-activity)
[![Downloads](https://img.shields.io/npm/dm/mqtt-energenie-ener314rt.svg)](https://www.npmjs.com/package/mqtt-energenie-ener314rt)
[![HitCount](http://hits.dwyl.io/achronite/mqtt-energenie-ener314rt.svg)](http://hits.dwyl.io/achronite/mqtt-energenie-ener314rt)
![node](https://img.shields.io/node/v/mqtt-energenie-ener314rt)
[![Release](https://img.shields.io/github/release-pre/achronite/mqtt-energenie-ener314rt.svg)](https://github.com/Achronite/mqtt-energenie-ener314rt/releases)
[![NPM](https://nodei.co/npm/mqtt-energenie-ener314rt.png)](https://nodei.co/npm/mqtt-energenie-ener314rt/)

## WARNING: THIS REPOSITORY IS UNDER DEVELOPMENT AND SHOULD BE USED WITH CAUTION

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
sudo apt install -y nodejs
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
    "mqtt": {
        "broker": "mqtt://pi3.local",
        "clientId": "mqtt-node", 
        "username":"node-ener314rt"
        "password":"xxxx"
    },
    "monitoring": true
}
```
* `topic_stub` should contain the base topic where your energenie messages should reside on mqtt, the default value should suit most installations.
* Modify the `mqtt` section with your broker details.
* If you have any energenie 'Control & Monitor' or 'Monitor' devices then set `"monitoring": true` otherwise remove or set false.

5) Run the application manually using the command: ``node app.js``
 


## Supported Devices

These nodes are designed for energenie RF radio devices in the OOK & FSK (OpenThings) ranges.

Here is a table showing the Device Topic a,d if control and monitoring is supoported for each device:

| Device | Description | Device Topic | Control | Monitoring | Supported |
|---|---|:---:|:---:|:---:|:---:|
|ENER002|Green Button Adapter|ook|Yes|No|Yes|
|ENER010|MiHome 4 gang Multiplug|ook|Yes|No|Yes|
|MIHO002|MiHome Smart Plug (Blue)|ook|Yes|No|Yes|
|MIHO004|MiHome Smart Monitor Plug (Pink)|1|No|Yes||
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


## 'Control Only' OOK Zone Rules
* Each Energenie **'Control'** or OOK based device can be assigned to a specifc zone (or house code) and a switch number.
* Each zone is encoded as a 20-bit address (1-1048575 decimal).
* Each zone can contain up to 6 separate switches (1-6) - NOTE: officially energenie state this is only 4 devices (1-4)
* All devices within the **same** zone can be switched **at the same time** using a switch number of '0'.
* A default zone '0' can be used to use Energenie's default zone (0x6C6C6).

## MQTT Topics

The commands and monitor messages are sent/received using MQTT topics.  The topic design is losely based on esphome devices, and parameter names generally align to the OpenThings parameter standard.

The following table shows some examples of the topics used:

|device|command topic|state topic|monitoring topics...|
|---|---|---|---|
|ook-switch|energenie/ook/*zone*/*switchNum*/command|energenie/ook/*zone*/*switchNum*/state|n/a|
|openThings-switch|energenie/2/*deviceNum*/switch/command|energenie/2/*deviceNum*/switch/state|energenie/2/*deviceNum*/REAL_POWER/state|
|openThings-monitor|n/a|energenie/5/*deviceNum*/switch/state|energenie/5/*deviceNum*/APPARENT_POWER/state|
|openThings-pir|n/a|energenie/12/*deviceNum*/motion/state|n/a|


For example the 'Smart Plug+' returns the following parameters:
```
{
    "timestamp": <numeric 'epoch based' timestamp, of when message was read>
    "REAL_POWER": <power in Watts being consumed>
    "REACTIVE_POWER": <Power in volt-ampere reactive (VAR)>
    "VOLTAGE": <Power in Volts>            
    "FREQUENCY": <Radio Frequency in Hz>
}
```
Other devices will return other parameters which you can use. I have provided parameter name and type mapping for the known values for received messages.

A full parameter list can be found in C/src/achronite/openThings.c if required.

## MiHome Radiator Valve (eTRV) Support

MiHome Thermostatic Radiator valves (eTRV) are supported.
> WARNING: Due to the way the eTRV works there may be a delay from when a command is sent to it being processed by the device. See **Command Caching** below

### eTRV Commands
The MiHome Thermostatic Radiator valve (eTRV) can accept commands to perform operations, provide diagnostics or perform self tests.  The documented commands are provided in the table below.

Single commands should be sent using the ``Cached`` function, using the command as the # numeric values. If there is no .data value, set it to 0.

| Command | # | Description | .data | Response Msg |
|---|:---:|---|---|:---:|
|EXERCISE_VALVE|163|Send exercise valve command, recommended once a week to calibrate eTRV||DIAGNOSTICS|
|SET_LOW_POWER_MODE|164|This is used to enhance battery life by limiting the hunting of the actuator, ie it limits small adjustments to degree of opening, when the room temperature is close to the *TEMP_SET* point. A consequence of the Low Power mode is that it may cause larger errors in controlling room temperature to the set temperature.|0=Off<br>1=On|No*|
|SET_VALVE_STATE|165|Set valve state|0=Open<br>1=Closed<br>2=Auto (default)|No|
|REQUEST_DIAGNOTICS|166|Request diagnostic data from device, if all is OK it will return 0. Otherwise see additional monitored values for status messages||DIAGNOSTICS|
|IDENTIFY|191|Identify the device by making the green light flash on the selected eTRV for 60 seconds||No|
|SET_REPORTING_INTERVAL|210|Update reporting interval to requested value|300-3600 seconds|No|
|REQUEST_VOLTAGE|226|Report current voltage of the batteries||VOLTAGE|
|TEMP_SET|244|Send new target temperature for eTRV.<br>NOTE: The VALVE_STATE must be set to 'Auto' for this to work.|int|No|

> \* Although this will not auto-report, a subsequent call to *REQUEST_DIAGNOTICS* will confirm the *LOW_POWER_MODE* setting

### Command Caching
Battery powered energenie devices, such as the eTRV or Thermostat do not constantly listen for commands.  For example, the eTRV reports its temperature at the *SET_REPORTING_INTERVAL* (default 5 minutes) after which the receiver is then activated to listen for commands. The receiver only remains active for 200ms or until a message is received.

To cater for these hardware limitations the ``Yes`` and ``Cached`` functions should be used.  Any command sent using the **CacheCmd** function will be held until a report is received by the receive thread from the device; at this point the most recent cached message (only 1 is supported) will be sent to the device.  Messages will continue to be resent until we know they have been succesfully received or until the number of retries has reached 0.

The reason that a command may be resent multiple times is due to reporting issues. The eTRV devices, unfortunately, do not send acknowledgement for every command type (indicated by a 'No' in the *Response* column in the above table).  This includes the *TEMP_SET* command!  So these commands are always resent for the full number of retries.

> **NOTE:** The performance of node may decrease when a command is cached due to dynamic polling. The frequency that the radio device is polled by the monitor thread automatically increases by a factor of 200 when a command is cached (it goes from checking every 5 seconds to every 25 milliseconds) this dramatically increases the chance of a message being correctly received sooner.

### eTRV Monitor Messages

To support the MiHome Radiator Valve (MIHO013) aka **'eTRV'** in v0.3 and above, additional code has been added to cache the monitor information for these devices.  An example of the values is shown below, only 'known' values are returned when the eTRV regularly reports the TEMPERATURE.  See table for types and determining when field was last updated:
```
{
    "deviceId":3989,
    "mfrId":4,
    "productId":3,
    "timestamp":1567932119,
    "TEMPERATURE":19.7,
    "EXERCISE_VALVE":"success",
    "VALVE_TS":1567927343,
    "DIAGNOSTICS":512,
    "DIAGNOSTICS_TS":1567927343,
    "LOW_POWER_MODE":false,
    "TARGET_C": 10,
    "VOLTAGE": 3.19,
    "VOLTAGE_TS": 1568036414,
    "ERRORS": true,
    "ERROR_TEXT": ...
}
```

|Parameter|Description|Data Type|Update time|
|---|---|---|---|
|command|number of current command being set to eTRV|int|timestamp|
|retries|The number of remaining retries for 'command' to be sent to eTRV>|int|timestamp|
|DIAGNOSTICS|Numeric diagnostic code, see "ERRORS" for interpretation|int|DIAGNOSTIC_TS|
|DIAGNOSTICS_TS|timestamp of when diagnostics were last received|epoch|DIAGNOSTIC_TS|
|ERRORS|true if an error condition has been detected|boolean|DIAGNOSTIC_TS|
|ERROR_TEXT|error information|string|DIAGNOSTIC_TS|
|EXERCISE_VALVE|The result of the *EXERCISE_VALVE* command| success or fail|DIAGNOSTIC_TS|
|LOW_POWER_MODE|eTRV is in low power mode state>|boolean|DIAGNOSTIC_TS|
|TARGET_C|Target temperature in celcius|int|TEMP_SET command|
|TEMPERATURE|The current temperature in celcius|float|timestamp|
|VALVE_STATE|Current valve mode/state| open, closed, auto, error|VALVE_STATE command *or* DIAGNOSTIC_TS on error|
|VALVE_TS|timestamp of when last *EXERCISE_VALVE* took place|epoch|DIAGNOSTIC_TS|
|VOLTAGE|Current battery voltage|float|VOLTAGE_TS|
|VOLTAGE_TS|Tmestamp of when battery voltage was last received|epoch|VOLTAGE_TS|

## Home Assistant Set-up
MQTT Example `configuration.yaml` file entries for OOK switches:
```
mqtt:
  switch:
    - unique_id: coffee_machine
      name: Coffee Machine
      command_topic: energenie/2/8294/switch/command
      optimistic: false
      state_topic: energenie/2/8294/switch/state

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
```

## Module Build Instructions
run 'node-gyp rebuild' in this directory to rebuild the node module.

## Change History
| Version | Date | Change details
|---|---|---|
0.1.0|Jan 2023|Initial alpha release

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