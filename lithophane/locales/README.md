# Localisation for Lithophane

Localisation is based on gettext and jed (http://slexaxton.github.io/Jed/).

1. Extract the strings
======================
Run following command to generate messages.po file: 

$ find . -iname '*.js' | xargs xgettext -c --from-code=utf-8 --force-po --debug -o locales/lithophane.pot
$ find . -iname '*.html' | xargs xgettext -c --from-code=utf-8 --join-existing --debug --keyword=pgettext:1c,2 --keyword=npgettext:1c,2,3 --language=python -o locales/lithophane.pot

As an alternative you could consider jspot: https://github.com/praekelt/jspot

2. Start translating
====================
To start translating, we initialize a po file your language. Let's consider Dutch:

$ cd locales
$ msginit -l nl -i lithophane.pot -o nl.po

Now translate the strings in nl.po. You can use a text editor, or a dedicated
translater like Babel

3. Updating translation
======================= 
When new or changed strings are present, we need to add them for translation.
First, do the step in 1. to generate a new lithophane.pot file with all strings.

This now must be merged in your existing version of the tranlation. Concider again
Dutch as before:

$ cd locales
$ msgmerge -U nl.po lithophane.pot 

4. Generate json version
========================
You need po2json.
On Ubuntu: 
$ sudo apt-get install node.js npm
$ npm install po2json

This will give you the po2json binary in node_modules/po2json/bin/po2json

If on running the next line you obtain a node error: "/usr/bin/env: node: No such file or directory", it is because node is called nodejs on Ubuntu. To fix, assuming you have no node program: $ sudo ln -s /usr/bin/nodejs /usr/bin/node

Use po2json to obtain json version:

$ /dir_to_install_location/po2json nl.po nl.json -f jed -p -d lithophane --fallback-to-msgid

Remove -p if you don't want the whitespace.
As we cannot set the stringOnly condition on CLI, you need to remove all entries "null,"

5. Use translation
==================
Create a .js file, use the Jed for English as base, or nl.js. Copy the translations from
your json file to the js file.
Make sure in index.html this js file in loaded, and that the Jed object is initialized 
with it.


