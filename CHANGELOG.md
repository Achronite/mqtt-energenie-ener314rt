# mqtt-eneregenie-ener314rt Change Log

## [Unreleased]

* Periodic eTRV commands [#10](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/10)
* Update state of all OOK switches within a single device when switch 0 used [#4](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/4)
* Enhance availability (or publish guidance) on OpenThings devices based on `last_seen`

Also see [Issues](https://github.com/Achronite/mqtt-energenie-ener314rt/issues) for additional details.
## [0.7.2] 2024-03

### Added

* Auto-retry added for MIHO005, enabled by adding `retry: true` into `config.json`.  This functions checks that the resulting monitor message matches the (just) sent command; if it is different it retries the command (indefinitely)


### Fixed

* 

### Changed

*

## [0.7.1] 2024-02-21

This release requires the following updates that will need to be manually installed:
* `node.js`: v18.2.0 or greater
* `gpiod` & `libgpiod`: New dependencies that need to be installed  (e.g raspbian: `sudo apt-get gpiod libgpiod`)

### Added

* Support added for MiHome Thermostat (MIHO069), including auto-messaging to obtain telemetry
* Support added for MiHome Click (MIHO089) [#79](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/79)
* MQTT Discovery: Added thermostat, including Climate Control entity
* MQTT Discovery: Added MiHome Click
* The number of retries is now configurable for cached commands (applies to eTRV and thermostat) by setting `cached_retries` in `config,json` (default remains at 10)
* MQTT Discovery: Added 'Battery Timestamp' (mapped to MQTT VOLTAGE_TS), 'Diagnostics Ran' (mapped to DIAGNOSTICS_TS) and 'Valve Exercised (mapped to VALVE_TS) for eTRV
* MQTT Discovery: Added 'Identify' Button for eTRV
* Setting target temperature now caters for 0.5 increments (previously integer)
* A different mechanism of reporting processed commands has been implemented for the thermostat, that relies on the fact that when (and only when) the thermostat procesess a command it outputs it's telemetry data.  This mechanism has been used to assume that the command just sent to the device (upon WAKEUP) has been processed succesfully; This command has it's retained state set in MQTT [#61](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/61
* MQTT Discovery: A new device `mqtt-energenie-ener314rt` has been added to represent the software and the ENER314-RT board, which includes a 'Discover' button, 'Connected State' and reports the number of discovered monitor (FSK) devices.  All Discoved 'monitor' devices are automatically linked to this new device as 'Connected devices'.  The README examples have also been updated to show how to link these to the board device using `via_device`.
* Home Assistant: Added 'Discover' button for the board device; this will perform a 10 second auto-scan and will update the device list via MQTT Discovery for all devices found.

### Fixed

* Added options to mqtt service for increased resillience of restarting the service upon failure [#62](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/62)(@genestealer)
* Removed verbose logging of MQTT password [#66](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/66)
* Only enable discovery if monitoring is also enabled [#82](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/82)

### Changed

* **BREAKING DEPENDENCIES**: The version of mqtt.js has been updated, this newer version required node.js >= v18.2.0
* **BREAKING DEPENDENCIES**: The version of `energenie-ener314rt` needed is v0.7.1.  This uses a newer GPIO library that is compatiable with the pi5. `gpiod` and `libgpiod` will need to be installed first
* Pretty printed all device JSON files
* MQTT Discovery: OEM Part Number and Device ID added to HA device model field (@genestealer)
* Submitting a cached command will now replace the exisiting cached command for the device
* Added data value to the reporting of `command` when it has been succesfully cached (also only update MQTT when this is set to 0=None) [#69](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/69),
    e.g. "Set Temperature" becomes "Set Temperature 18.5"
* Bumped MQTT to 5.3.5 [#62](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/62)
* MQTT Discovery: In line with HA best practices, the primary entities for each of the FSK devices (see table below) have had their names updated to 'None'/null, e.g: sensor.motion_sensor.XXX.motion -> sensor.motion_sensor.XXX.  These entities are indicated by `"main":true` in the device json files.

|Device|Description|Primary Entity name set to null|
|---|---|---|
|MIHO004|MiHome Smart Monitor Plug (Pink)|real power|
|MIHO005|MiHome Smart Plug+ (Purple)|switch|
|MIHO006|MiHome House Monitor|apparent power|
|MIHO013|MiHome Radiator Valve|climate control|
|MIHO032|MiHome Motion sensor|motion|
|MIHO033|MiHome Open Sensor|contact|
|MIHO069|MiHome Heating Thermostat|climate control|
|MIHO089|MiHome Click|voltage|

See also: https://github.com/Achronite/energenie-ener314rt/releases/tag/v0.7.1  - Notably pi5 support and GPIO driver changes


## [0.6.0] 2023-11-13

### Added

* Extra keys '433MHz' and 'MiHome' added to `package.json` (@genestealer)
* Instructions added to README for joining undiscovered Monitor devices [#52](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/52)

### Fixed

* Type error on Maintenance LOW_POWER_MODE causing crash [#49](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/49)
### Changed

* MQTT Discovery: Entity names are now in Title Case (instead of all lower case)
* MQTT Discovery: eTRV Climate now operates differently to align closer to the Climate modes in Home Assistant [#47](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/47) (note: the numbers in brackets show the equivalent eTRV `VALVE_STATE`)
  * 'auto' (2) mode in HA means it is run by an external schedule, so has therefore been removed as not applicable 
  * 'heat' (was 0 now 2) mode operates to the set-point temperature
  * 'off' (1) mode unchanged
  * 'always on' (0) has been removed, as there isn't an equivalent in HA
* MQTT Discovery: Origin added to device discovery message (@genestealer)
* MQTT Discovery: Device Class for Smart Plug switch set to outlet (@genestealer)
* MQTT Discovery: eTRV `REPORTING_INTERVAL` and `Maintenance` Entity categories set to config (@genestealer)
* MQTT Discovery: eTRV temperature step added and set to 0.5 (@genestealer)
* MQTT Discovery: Battery % now shows as dynamic icon in Home Assistant for eTRV (@genestealer) and Home Energy Monitor (@Achronite)
* MQTT Discovery: `FREQUENCY` and `VOLTAGE` added as HA 'disabled entities' for Monitor Plug, and Smart Plug+

## [0.5.1] 2023-08-16 Alpha

### Fixed

* Battery level calculation modified (again) to prevent values above 100% [#37](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/37)
### Changed

* Software version added to the startup log message and the `sw_version` for HA discovery (@webash)
* MQTT Discovery: 'Energenie' capitalised in manufacturer (@webash)


## [0.5.0] 2023-08-11 Alpha

### Added

* Configurable levels of logging within the application [#24](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/24).<br>
The log level can now be configured in the `config.json` file using `log_level`.  The file is read **once** on startup. The default log_level is `http`, which logs all incoming and outgoing commands/messages.

### Fixed

* Simplified algorithm for battery % calculation. Tries to close [#31](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/31)
* Fixed a bug where the target switch state sometimes fails to be updated in MQTT for OOK devices due to a bug in dependency [energenie-ener314rt#32](https://github.com/Achronite/energenie-ener314rt/issues/32)
* Fixed a bug where a stack trace was sometimes output for MQTT connection when exiting application

### Changed

* Dependencies: Bumped MQTT.js version to 5.0.2 and node.js minimum version to 15. [#38](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/38)

## [0.4.0] 2023-08-07 Alpha

### Added

* Translated `ALARM: 66` to `ALARM: Low battery alert`. Fixes [#28](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/28)

### Fixed

* MQTT Discovery: Battery missing unit of measurement. Fixes [#30](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/30)
* MQTT Discovery: Removed name of entity from the device name. Fixes [#34](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/34)

## [0.3.0] 2023-03-06 Alpha

### Added

* Added `device` section to manual MQTT setup for Home Assistant (to assist in HA automations)
* Added estimated `battery` topics for eTRV and Whole house monitor [#17]
* Renamed default `config.json` file to `config_sample.json` to prevent user config overwrites upon update of code
* MQTT Discovery: Added `ALARM` reportng for PIR, it is believed a value of 66 = `Low battery alert` See [#28](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/28)


### Fixed

* Fixed README instructions for install
* MQTT Discovery: Renamed measurement unit VAR to var for devices #[#25]
* MQTT Discovery: Fixed REPORTING_INTERVAL device_class [#26] for eTRV

## [0.2.0] 2023-01-31 Alpha

### Added
* Grouped a devices parameters for HA MQTT discovery [#15](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/15)
* Request Voltage added to Maintenance commands for eTRV
* Added 'last_seen' topic as epoch for all OpenThings devices at device level [#18](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/18)
* Guidance added to README for formatting epoch timestamps in Home Assistant
* Added overall availability of application, including basing all discovery devices on this overall availability topic [#19](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/15)
* Implemented 'climate' card for applicable eTRV parameters in MQTT discovery [#16](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/16)
* Config values added for OOK and FSK xmits (excluding cached_cmds for eTRV) [#21](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/21)

### Changed
* Replaced underscores with spaces for MQTT discovery entity names
* Reduced MQTT discovery message lengths by expanding '~' to include the device type and id
* Set retain flag on irregular reported values on MQTT for 'VALVE_STATE', 'LOW_POWER_MODE', 'REPORTING_INTERVAL', 'TARGET_TEMP' & 'ERROR_TEXT'
* Simplified state/command values for VALVE_STATE to be 0,1,2 (Maintenance cmds unchanged)

### Fixed
* Issue in MQTT discovery that prevented battery voltage being shown for eTRV and House Energy monitor


## [0.1.0] 2023-01-25 Alpha

### Added
* Initial packaged release, logging remains for all MQTT inputs & outputs in this version
* Support for switched OOK devices is included
* Switch support for MiHome Adaptor+ included
* MiHome PIR & Door Sensor supported
* Async monitoring of all known parameters for FSK/OpenThings devices is included
* Home Assistant MQTT Discovery added for MiHome devices:
  - Monitor Plug
  - Smart Plug+
  - Radiator Valve (includes simplified commands using 'Maintenance' dropdown)
  - Whole House Monitor
  - Door (Contact) Sensor
  - PIR
