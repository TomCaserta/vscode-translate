# vscode-translate

## Installation

If you are on Mac/Linux you can simply type the following to install this extension (Restart VSCode to see the changes).

```
git clone git@github.com:TomCaserta/vscode-translate.git ~/.vscode/extensions/vscode-translate
```

On Windows replace the path to the extensions folder appropriately.

## Extension Settings

Open up your workspace/user settings on vscode and search for 'translate'.

By default you are required to enter the production and staging URLs. If the URL requires a language parameter you can use `%LANG%` which will get replaced with the current language when fetching the translations.

The translations are cached in memory when you load VSCode for each language until you close or refresh the translations manually.