#!/usr/bin/env bash
#
# Netlify used to push Convex from this script. That mixed DEV and PROD
# whenever a Netlify build ran. Convex is now deployed by hand — see AGENTS.md.
#
# Kept so an old Netlify config that still points here only builds the app.

set -euo pipefail
npm run build
