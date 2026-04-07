#!/bin/bash

node parser.js

sleep 0.1
#/bin/mv index.html /var/www
#/bin/mv stress-ng.html /var/www/
#/bin/mv data.js /var/www/
/bin/cp ./*.css ./*.html ./*.xlsx /var/www/
systemctl reload nginx

echo "file init & nginx reload done"
