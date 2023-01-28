# mqtt-eneregenie-ener314rt Change Log

## [Unreleased]

* Home Assistant MQTT discovery for 'Control Only' devices for  [#7](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/7)
* MiHome Thermostat control & MQTT discovery
* Improvements to error handling (partial fix is included) [#11](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/11)
* Periodic eTRV commands [#10](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/10)
* Update state of all OOK switches within a single device when switch 0 used [#4](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/4)
* Enhance availability (or publish guidance) on OpenThings devices based on last_seen

Also see [Issues](https://github.com/Achronite/mqtt-energenie-ener314rt/issues) for additional details.

## [0.1.1] 2023-01-XX Alpha

### Added
* Group a devices parameters for MQTT discovery [#15](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/15)
* Request Voltage added to Maintenance commands for eTRV
* Set retain flag on irregular reported values on MQTT for 'VALVE_STATE', 'LOW_POWER_MODE', 'REPORTING_INTERVAL', 'TARGET_TEMP' & 'ERROR_TEXT':
* Added 'last_seen' topic for all OpenThings devices at device level [#18](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/18)
* Added overall availability of application, including basing all discovery devices on this overall availability topic [#19](https://github.com/Achronite/mqtt-energenie-ener314rt/issues/15)

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
