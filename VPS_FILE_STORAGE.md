# VPS file storage

New uploads are stored by the Express API under `STORAGE_DIR` and served from
`/uploads/storage/...`. The default directory is `Server/uploads/storage`; on
the VPS, point it at a persistent directory outside the release checkout.

## Required production configuration

Set these values in the backend process environment before restarting it:

```env
STORAGE_DIR=/var/lib/smartlms/uploads
STORAGE_PUBLIC_BASE_URL=http://187.126.118.102:5533
```

`STORAGE_PUBLIC_BASE_URL` must be the same API origin used by the browser (the
value configured as `NEXT_PUBLIC_API_URL` in the frontend build). If the site
is served over HTTPS, serve the API over HTTPS too and use that origin here;
otherwise browsers block these media URLs as mixed content. The folder
must be writable by the Linux account running Node. Create it once and grant
that account ownership. If the API is behind Nginx, allow request bodies of at
least 110 MB and allow uploads to finish before the proxy timeout; the API
accepts recordings up to 100 MB.

Back up this directory with the database. Local VPS storage survives app code
releases when `STORAGE_DIR` is outside the deployed checkout, but it does not
survive VPS disk failure without a separate backup.

## Existing Cloudinary records

The code now sends new application uploads to VPS storage. Existing database
records that still contain Cloudinary URLs continue to reference those files.
Back up MongoDB and check free VPS disk space before migrating. The included
script first scans without changing data:

```bash
cd Server
node scripts/migrateCloudinaryToVps.js
```

After reviewing the count and confirming disk space and backups, run it with
`--apply` to copy the files and update database URLs:

```bash
node scripts/migrateCloudinaryToVps.js --apply
```

Keep the Cloudinary account available until existing URLs have been migrated
and the app has been checked against the new files.

## Deployment

Deploy the backend and frontend together. Rebuild the frontend with
`NEXT_PUBLIC_API_URL` pointing at the VPS API, configure the backend values
above, create the persistent directory, and restart the API. The Cloudinary
SDK has been removed from the backend dependencies. Keep the account available
until the existing media migration is complete.
