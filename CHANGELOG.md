# mqtt-eneregenie-ener314rt Change Log

## [Unreleased]

* Periodic eTRV commands [#10](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/10)
* Update state of all OOK switches within a single device when switch 0 used [#4](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/4)
* Enhance availability (or publish guidance) on OpenThings devices based on `last_seen`
* MiHome Thermostat control, including MQTT discovery of Thermostat
* Configurable xmits for eTRV - requires `energenie-ener314rt` module change
* Configurable logging levels [#24](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/24)

Also see [Issues](https://github.com/Achronite/mqtt-energenie-ener314rt/issues) for additional details.
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
* MQTT Discovery: `FREQUENCY` and `VOLTAGE` added option in config file to control default HA 'disabled entities' behaviour for Monitor Plug, and Smart Plug+ (@genestealer)

Suggest adding 

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
