'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
const request = require("request-promise-native");
function activate(context) {
    const availableLanguages = [
        'javascript',
        'json',
        'typescript',
        'pug',
        'jade'
    ];
    const controller = new LensTranslationsController();
    availableLanguages.forEach(language => {
        context.subscriptions.push(vscode_1.languages.registerCodeLensProvider(language, {
            onDidChangeCodeLenses: controller.onChangeCodeLens,
            provideCodeLenses
        }));
    });
    context.subscriptions.push(vscode_1.commands.registerCommand('translate.changeLanguage', () => {
        const configuration = vscode_1.workspace.getConfiguration('translator');
        const languages = configuration.get('languages');
        const menuItems = languages.map((language) => {
            return `Switch to language '${language}'`;
        });
        const selectItem = (isHover, item) => {
            if (item === 'Switch to Production') {
                controller.switchEnvironment('production');
            }
            else if (item === 'Switch to Staging') {
                controller.switchEnvironment('staging');
            }
            else if (!isHover && item === 'Refresh Translations') {
                controller.refreshKeys();
            }
            else {
                const regex = /^Switch to language '(.+)'$/i;
                const matches = regex.exec(item.toString());
                console.log(matches);
                if (matches[1]) {
                    controller.switchLanguage(matches[1]);
                }
            }
        };
        vscode_1.window.showQuickPick([
            ...menuItems,
            controller.environment === 'staging' ? 'Switch to Production' : 'Switch to Staging',
            'Refresh Translations'
        ]).then(selectItem.bind(null, false));
    }));
    function provideCodeLenses(document, token) {
        return __awaiter(this, void 0, void 0, function* () {
            let translations = yield controller.getTranslations(controller.findTranslationKeys(document));
            translations = translations.filter((translation) => {
                return translation.result !== null;
            });
            return translations.map((translation) => {
                return new vscode_1.CodeLens(translation.range, {
                    title: translation.result,
                    command: 'translate.changeLanguage'
                });
            });
        });
    }
    context.subscriptions.push(controller);
}
exports.activate = activate;
function deactivate() {
}
exports.deactivate = deactivate;
class LensTranslationsController {
    constructor() {
        this.changeEmitter = new vscode_1.EventEmitter();
        this.translations = new Map();
        this.translationRegex = /([0-9a-fA-F]{15,35})/ig;
        /**
         *  Configuration Values
         */
        this.currentEnvironment = 'staging';
        this.currentLanguage = '';
        this.currentUrl = '';
        vscode_1.workspace.onDidChangeConfiguration(this.onConfigurationChange, this, this.subscriptions);
        const languages = vscode_1.workspace.getConfiguration('translator').get('languages', ['en']);
        this.currentLanguage = languages[0] || 'en';
        console.log('Constructing Language Lens');
        this.onConfigurationChange();
    }
    get onChangeCodeLens() {
        return this.changeEmitter.event;
    }
    get language() {
        return this.currentLanguage;
    }
    get environment() {
        return this.currentEnvironment;
    }
    switchEnvironment(toEnvironment) {
        this.currentEnvironment = toEnvironment;
        this.onConfigurationChange();
    }
    switchLanguage(toLanguage) {
        this.currentLanguage = toLanguage;
        this.onConfigurationChange();
    }
    refreshKeys() {
        this.translations = new Map();
        this.onConfigurationChange();
    }
    getKey() {
        return this.currentLanguage + '_' + this.currentEnvironment;
    }
    onConfigurationChange() {
        const configuration = vscode_1.workspace.getConfiguration('translator');
        const locations = configuration.get('locations', {
            production: '',
            staging: ''
        });
        this.currentUrl = (locations[this.currentEnvironment] || '').replace('%LANG%', this.currentLanguage);
        this.supressNonExistant = configuration.get('suppressNonExistant');
        console.log('Switching to', this.currentUrl);
        if (this.currentUrl) {
            this.changeEmitter.fire();
        }
    }
    dispose() {
        vscode_1.Disposable.from(...this.subscriptions).dispose();
    }
    fetchTranslations() {
        if (!this.currentUrl) {
            return Promise.resolve(null);
        }
        console.log('Switching', Array.from(this.translations.keys()), this.getKey());
        if (!this.translations.has(this.getKey())) {
            this.translations.set(this.getKey(), request(this.currentUrl).then((result) => {
                try {
                    const translations = JSON.parse(result);
                    const keyToTranslation = new Map();
                    translations.forEach((translation) => {
                        keyToTranslation.set(translation.key, translation.val);
                    });
                    return keyToTranslation;
                }
                catch (e) {
                    console.error(e);
                    throw new Error('Could not parse the translations file, please ensure its valid JSON');
                }
            }, () => {
                return null;
            }));
        }
        return this.translations.get(this.getKey());
    }
    getTranslations(keys) {
        return __awaiter(this, void 0, void 0, function* () {
            const translations = yield this.fetchTranslations();
            const translated = keys.map((key) => {
                if (translations === null) {
                    return Object.assign(key, { result: 'Couldnt fetch the translations file. Check your settings.' });
                }
                if (translations.has(key.text)) {
                    return Object.assign(key, { result: translations.get(key.text) });
                }
                return Object.assign(key, { result: (this.supressNonExistant ? null : 'No translation found...') });
            });
            return translated;
        });
    }
    findTranslationKeys(document) {
        const matches = [];
        const regex = this.translationRegex;
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            let match;
            regex.lastIndex = 0;
            while ((match = regex.exec(line.text))) {
                if (!match && !match[1])
                    return;
                matches.push({
                    range: new vscode_1.Range(i, match.index, i, match.index + match[1].length),
                    text: match[1]
                });
            }
        }
        return matches;
    }
}
//# sourceMappingURL=extension.js.map