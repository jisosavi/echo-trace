#!/bin/bash
# stream-logs.sh

# The path to your OpenClaw log file
LOG_FILE="$HOME/.openclaw/logs/gateway.log"

# Tail the last 50 lines and then follow new ones
# We pipe it to an 'activity.log' on your web server
tail -f "$LOG_FILE" | while read -r line; do
  # Send each new line to the server via SSH
  echo "$line" | ssh user@isosavi.com "cat >> /var/www/isosavi/public/data/activity.log"
done