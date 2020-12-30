#!/bin/bash
set -e
set +x

trap "cd $(pwd -P)" EXIT
cd "$(dirname "$0")"

if [[ ($1 == '--help') || ($1 == '-h') ]]; then
  echo "usage: $(basename $0) [BLOB-PATH] [--check|ZIP-PATH]"
  echo
  echo "Upload ZIP-PATH to BLOB-PATH in `builds` container."
  echo
  echo "--check      pass |--check| as a second parameter instead of a zip-path to check for"
  echo "             existance of BLOB-PATH"
  echo
  echo "NOTE: \$AZ_ACCOUNT_KEY (azure account name) and \$AZ_ACCOUNT_NAME (azure account name)"
  echo "env variables are required to upload builds to CDN."
  exit 0
fi

if [[ (-z $AZ_ACCOUNT_KEY) || (-z $AZ_ACCOUNT_NAME) ]]; then
  echo "ERROR: Either \$AZ_ACCOUNT_KEY or \$AZ_ACCOUNT_NAME environment variable is missing."
  echo "       'Azure Account Name' and 'Azure Account Key' secrets that are required"
  echo "       to upload builds ot Azure CDN."
  exit 1
fi

if [[ $# < 2 ]]; then
  echo "not enought arguments!"
  echo "try '$(basename $0) --help' for more information"
  exit 1
fi

BLOB_PATH="$1"
ZIP_PATH="$2"

if [[ ("$2" == '--check') ]]; then
  EXISTS=$(az storage blob exists -c builds --account-key $AZ_ACCOUNT_KEY --account-name $AZ_ACCOUNT_NAME -n "$BLOB_PATH" --query "exists")
  if [[ $EXISTS == "true" ]]; then
    exit 0
  else
    exit 1
  fi
fi

if ! [[ -f $ZIP_PATH ]]; then
  echo "ERROR: ${ZIP_PATH} does not exist"
  exit 1
fi
if [[ "${ZIP_PATH}" != *.zip && "${ZIP_PATH}" != *.gz ]]; then
  echo "ERROR: ${ZIP_PATH} is not an archive (must have a .zip or .gz extension)"
  exit 1
fi
if [[ $(uname) == MINGW* ]]; then
  # Convert POSIX path to MSYS
  WIN_PATH=$({ cd $(dirname $ZIP_PATH) && pwd -W; } | sed 's|/|\\|g')
  WIN_PATH="${WIN_PATH}\\$(basename $ZIP_PATH)"
  az storage blob upload -c builds --account-key $AZ_ACCOUNT_KEY --account-name $AZ_ACCOUNT_NAME -f $WIN_PATH -n $BLOB_PATH
else
  az storage blob upload -c builds --account-key $AZ_ACCOUNT_KEY --account-name $AZ_ACCOUNT_NAME -f $ZIP_PATH -n "$BLOB_PATH"
fi

echo "UPLOAD SUCCESSFUL!"
echo "--  SRC: $ZIP_PATH"
echo "-- SIZE: $(du -h "$ZIP_PATH" | awk '{print $1}')"
echo "--  DST: $BLOB_PATH"

