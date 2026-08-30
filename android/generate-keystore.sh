#!/bin/bash
# Generate the release keystore for signing the Android app.
# Run once locally, then base64 the result into the KEYSTORE_BASE64 GitHub secret.
set -euo pipefail

KEYSTORE_PATH="app/release-keystore.jks"
KEY_ALIAS="${KEY_ALIAS:-emoji-guesser}"

if [ -f "$KEYSTORE_PATH" ]; then
    echo "Keystore already exists at $KEYSTORE_PATH"
    exit 0
fi

if [ -z "${KEYSTORE_PASSWORD:-}" ] || [ -z "${KEY_PASSWORD:-}" ]; then
    echo "Set KEYSTORE_PASSWORD and KEY_PASSWORD before running (do not hardcode them)."
    exit 1
fi

echo "Generating release keystore..."

keytool -genkey -v \
    -keystore "$KEYSTORE_PATH" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -alias "$KEY_ALIAS" \
    -storepass "$KEYSTORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -dname "CN=Emoji Guesser, OU=Mobile, O=EmojiGuesser, L=Melbourne, ST=VIC, C=AU"

echo "Keystore generated successfully at $KEYSTORE_PATH"
