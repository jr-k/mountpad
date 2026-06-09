# MountPad

A small, self-hosted file station for your server.

Point it at a folder, sign in from the browser, and share access with the people you trust. That is the whole idea.

## Why

You have a server. You have files on it. You want to browse them, edit a config, drop in a backup, hand a folder to a teammate, without opening an SSH session and without shipping the data off to a third party.

MountPad is the little web app that sits on top of your storage and gives you exactly that, nothing more.

## What you get

- A clean file explorer in your browser
- A simple editor for text files
- Accounts, sessions, and per-folder permissions
- One container to run, SQLite by default, Postgres if you prefer
- Your files stay on your machine

## Mounts

You don't expose your whole disk in one block. Instead you carve it into **mounts**, which are just named entry points into a specific folder: `Backups`, `Family Photos`, `Project Alpha`, whatever fits.

Each mount has its own access rules. One can be read-only for everyone, another writable for two trusted accounts, another fully private. People only see the mounts they are allowed in, and the rest of the disk simply does not exist for them.

Add a mount, set who can do what, and move on.

## Getting started

Copy the example env file, start the container, open the app:

```bash
cp .env.sqlite.example .env
docker compose -f docker-compose.dev.sqlite.yml up
```

Then visit `http://localhost:4499` and create the first account.

That is the whole pitch. Have fun.
