# mqtt-eneregenie-ener314rt Change Log

## [Unreleased]

* Periodic eTRV commands [#10](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/10)
* Update state of all OOK switches within a single device when switch 0 used [#4](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/4)
* Enhance availability (or publish guidance) on OpenThings devices based on `last_seen`
* MiHome Thermostat control, including MQTT discovery of Thermostat
* Configurable xmits for eTRV - requires `energenie-ener314rt` module change
* Configurable logging levels [#24](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/24)

Also see [Issues](https://github.com/Achronite/mqtt-energenie-ener314rt/issues) for additional details.

## [0.5.0] 2023-XX-XX Beta

### Added

* 

### Fixed

* Simplified algorithm for battery % calculation. Tries to close [#31](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/31)

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
