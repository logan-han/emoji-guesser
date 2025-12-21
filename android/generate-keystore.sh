#!/bin/bash
# Generate release keystore for signing Android app
# This script is run during CI/CD to create the keystore

KEYSTORE_PATH="app/release-keystore.jks"
KEYSTORE_PASSWORD="EmojiGuesser2024!"
KEY_ALIAS="emoji-guesser"
KEY_PASSWORD="EmojiGuesser2024!"

if [ -f "$KEYSTORE_PATH" ]; then
    echo "Keystore already exists at $KEYSTORE_PATH"
    exit 0
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
    -dname "CN=Emoji Guesser, OU=Mobile, O=EmojiGuesser, L=Sydney, ST=NSW, C=AU"

echo "Keystore generated successfully at $KEYSTORE_PATH"
