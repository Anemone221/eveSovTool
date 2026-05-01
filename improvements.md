# Improvements to be done:

Below will be per section improvements I want to complete:

## Universe

> Necessary

- Add Filter to Allow only Sov-able system to be visible
- Add sections for claimed and unclaimed systems
- Add Count Section at the top of the Universe Page for total systems claimed and for 16/36 system for a specific region
- Add ability to choose a region or constellation and then remove a specific constellation/system to allow you to bulk choose, single remove. (Reduce total clicks)

> QOL

- Add System count to right of region/constellation name
- On specific system if claimed add a Home Flag if we designate it as a Capital

## System

> Necessary

- Finish Implementing the Work Force transfer system.
- Add validation that work force transfer will work.
- Add input field to allow user to input specific amount of work force at once
- Add check box for "transfer remainder"
- If system does not produce a resource such as superionic or magmatic set the bar to empty
- Add Jump bridge system
  - If Advanced Logistics Network exists require it to be linked to another system. You will have a drop down able to select from other systems in range.
    - Range Calculation is done by: "(((sqrt((($a['x']-$b['x'])_($a['x']-$b['x']))+(($a['y']-$b['y'])_($a['y']-$b['y']))+(($a['z']-$b['z'])\*($a['z']-$b['z']))))/149597870691)/63239.6717)"
    - Give Check box for Manual entry, Auto complete system names. (Allows cross alliance Ansi's)

> QOL

- Add symbols for Cyno beacon, Cyno Jammer, Supercaptial Production, Advanced Logistics Network

> Feature Add

- PI Features
- Add Planet types into planet name (Lava, Plasma Etc)
- Allow us to calculate available PI materials for a system.

- Structure System
  - Import from clipboard button to allow that structure export from game or pyfa and the program generates a small card for the station.
  - Ansiblex upgrades auto generate a card for the relevant structure that gets added to the system from having that upgrade
  - Add a drop down to manually add a structure to the plan (mainly for metenox's but can also manually add a structure). These will be rigless stations.
  - Allow input location of stations in locality. (Deep, Planet, Moon, Gate, Ansiblex)
  - For Metenox and Athanors/Tatara
    - If Moon scans exist and external Data Sync is enabled calculate profitablility of Moon for Metenox
    - If Moon scans exist and external Data Sync is enabled calculate profitablility of Moon per hour of Drilling for Athanor/tatara
  - If Sotiyo in system Check if system has Supercapital building, if True add a Sotiyo Flag to the system Title and update universe with a sotiyo symbol also.

## Plans

> Necessary

- add 2 columns, one for date created, other for date modified
- Add location column: Tells us what region the sov we are planning exists.

> QOL

> Feature Add

## Inspector

> Necessary

> QOL

- Add symbols for Strategic Upgrades/Supercapitals next to systems.
- Add reverse system for ice and Gas for Constellation system
- Warning if no ADM activites exist in this system

> Feature Add

## Matrix

> Necessary

- Add check boxes at the top of the page to allow you to check and uncheck formatting.
  - Add ability to color System names based on resource usage.
  - Add ability to add upgrade symbols for systems
  - Add ability to swap from 45 degree names to 90 degree names

> QOL

- Investigate stickiy for totals

> Feature Add

- Export Image of page

## Sites

> Necessary

- Add check boxes at the top of the page to allow you to check and uncheck formatting.
  - Add ability to color System names based on resource usage.
  - Add ability to add upgrade symbols for systems
  - Add ability to swap from 45 degree names to 90 degree names

> QOL

- Add upgrade name to system (Mjr.3, Mnr. 2)

> Feature Add

## Upgrades

> Necessary

- Add tree system for categories of upgrade
- Add time required for ugprade for strategic upgrades.

> QOL

- Add check box at top of page for tree view or no tree view. In no tree view add column for upgrade tyep.
  > Feature Add

# Planned Pages

## Exports

> Necessary

- Export matrix as PNG
- Export Sites as PNG
- Export Maps
- Configure Export information
  - Allows for OP-sec of senstive information
  - Allows to export map's/images of specific information.
- **DNA** export. Ala PYFA export to allow us to import a plan for someone else to allow them to pick up from where you are at.

> QOL

- Time stamps of already done exports. Along with plan name they happened on.

> Feature Add

## Structures

> Necessary

- List of structure you have broken down by tree (Region/Constellation/System)
- If metenox/athanor/Tatara/ calculate profitability of moon if moon data exist and external data connection is enabled.
- Add import from clipboard

> QOL
> Feature Add

## Moon Scans

> Necessary

- Add system to allow the storage of moon scan data
  > QOL
  > Feature Add

## Data Sync System

> Necessary

- Add the ability to turn off and on data syncing with API features for market data, sov data, or any other information that we determine we want to import.

> QOL
> Feature Add
