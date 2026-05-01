# Sov Planning Tool for Eve online Players

This is an Electron + React + TypeScript + Vite (`electron-vite` scaffold) Application. A, at this point and time, local only program. This is not ment to upload or download any external data at this time. The program is written in Typescript. It is ment to eventually packaged up in a .exe and distributed.

Read more about the purpose and logic of the app in [README](/README.md) @README.MD

# Documentation practices

Check feature docs first. Before exploring code or planning a feature, check docs/features/INDEX.md to find the relevant doc. Feature docs contain schema, API, key decisions, and file paths — use them as the starting point.

Create/update feature docs in docs/features/{category}.MD for every new feature or significant change. Current categories are: Universe/System/Plans/Inspector/Matrix/Sites/Upgrades/Exports/Structures/Moon Scans/Data Sync System. If the category you are working on does not exist go ahead and create a new one.

# Information useful for development

We are using Vite to test the system locally before building the .exe so most changes you will make to front end and css will be hot reloaded. This allows you to make changes without having to restart the process.

# Formatting

Human Devs have IDEs that autoformat code on every file save. After you edit files, you must do the equivalent by formatting the document

# Interacting with the Application

The only way to interact with the electron app will be in the dev enviornment right now. You are allowed to use the program to test functionality

# Additional Information

We are open to providng more of the EVE SDE if required to fully develop or update a feature to completion.

# Planning Complex Features

For multi-file changes or architectural decisions, use plan mode first
Present options to the user when multiple approaches are valid
Break down large features into phases with clear verification steps
Always check docs/features/INDEX.md for existing feature docs before starting work

# Privacy

Do NOT include Discord usernames or other personal attributions in GitHub issues.
