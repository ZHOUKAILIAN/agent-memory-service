#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
migrations_dir="${script_dir}/../src/db/migrations"

for file in "${migrations_dir}"/*.sql; do
  echo "applying migration: ${file}"
  psql "${DATABASE_URL}" -f "${file}"
done
