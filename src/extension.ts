'use strict';
import { window, ExtensionContext, Disposable, languages, TextDocument, CancellationToken, Range, CodeLens, commands, workspace, EventEmitter, Event } from 'vscode';
import * as request from 'request-promise-native';


export function activate(context: ExtensionContext) {
    const availableLanguages = [
        'javascript',
        'json',
        'typescript',
        'pug',
        'jade'
    ];

    const controller = new LensTranslationsController();
    
    availableLanguages.forEach(language => {
        context.subscriptions.push(languages.registerCodeLensProvider(language, { 
           onDidChangeCodeLenses: controller.onChangeCodeLens,
           provideCodeLenses
        }));
    });

    context.subscriptions.push(commands.registerCommand('translate.changeLanguage', () => {
        const configuration = workspace.getConfiguration('translator');
        const languages: any[] = configuration.get('languages');

        const menuItems = languages.map((language) => {
            return `Switch to language '${language}'`
        });

        const selectItem = (isHover, item) => {
            if (item === 'Switch to Production') {
                controller.switchEnvironment('production');
            } else if (item === 'Switch to Staging') {
                controller.switchEnvironment('staging');
            } else if (!isHover && item === 'Refresh Translations') {
                controller.refreshKeys();
            } else {
                const regex = /^Switch to language '(.+)'$/i
                const matches = regex.exec(item.toString());
                console.log(matches);
                if (matches[1]) {
                    controller.switchLanguage(matches[1]);
                }
            }
        };

        window.showQuickPick([
            ...menuItems,
            controller.environment === 'staging' ? 'Switch to Production' : 'Switch to Staging',
            'Refresh Translations'
        ]).then(selectItem.bind(null, false));
    }));

    async function provideCodeLenses(document: TextDocument, token: CancellationToken) {
        let translations = await controller.getTranslations(controller.findTranslationKeys(document));

        translations = translations.filter((translation) => {
            return translation.result !== null;
        });

        return translations.map((translation) => {
            return new CodeLens(translation.range, {
                title: translation.result,
                command: 'translate.changeLanguage'
            })
        });
    }


    context.subscriptions.push(controller);
}

export function deactivate() {

}

interface ITranslationLocation {
    text: string;
    range: Range;
    result?: string
}

type Environment = 'production' | 'staging';

class LensTranslationsController {
    public get onChangeCodeLens(): Event<void> {
        return this.changeEmitter.event;
    }

    private changeEmitter = new EventEmitter<void>();
    private subscriptions: Disposable[];
    private translations: Map<string, Promise<Map<string, string>>> = new Map<string, Promise<Map<string, string>>>();
    private translationRegex =  /([0-9a-fA-F]{15,35})/ig;
    

    /**
     *  Configuration Values
     */
    private currentEnvironment: Environment = 'staging';
    private currentLanguage: string = '';
    private currentUrl: string = '';
    private supressNonExistant: boolean;

    public get language() {
        return this.currentLanguage;
    }

    public get environment() {
        return this.currentEnvironment;
    }

    constructor() {
        workspace.onDidChangeConfiguration(this.onConfigurationChange, this, this.subscriptions);
        const languages = workspace.getConfiguration('translator').get('languages', ['en']);
        this.currentLanguage = languages[0] || 'en';
        console.log('Constructing Language Lens');
        this.onConfigurationChange();
    }

    public switchEnvironment(toEnvironment: Environment) {
        this.currentEnvironment = toEnvironment;
        this.onConfigurationChange();
    }

    public switchLanguage(toLanguage: string) {
        this.currentLanguage = toLanguage;
        this.onConfigurationChange();
    }

    public refreshKeys(): void {
        this.translations = new Map<string, Promise<Map<string, string>>>();
        this.onConfigurationChange();
    }

    private getKey(): string {
        return this.currentLanguage + '_' + this.currentEnvironment;
    }

    private onConfigurationChange(): void {
        const configuration = workspace.getConfiguration('translator');

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

    public dispose(): void {
        Disposable.from(...this.subscriptions).dispose();
    }

    public fetchTranslations(): Promise<Map<string, string>> {
        if (!this.currentUrl) {
            return Promise.resolve(null);
        }
        console.log('Switching', Array.from(this.translations.keys()), this.getKey());
        if (!this.translations.has(this.getKey())) {
            this.translations.set(this.getKey(), request(this.currentUrl).then((result) => {
                try { 
                    const translations = JSON.parse(result);
                    const keyToTranslation = new Map<string, string>();

                    translations.forEach((translation) => {
                        keyToTranslation.set(translation.key, translation.val);
                    });

                    return keyToTranslation;
                } catch (e) {
                    console.error(e);
                    throw new Error('Could not parse the translations file, please ensure its valid JSON');
                }
            }, () => {
                return null;
            }));
        }
        return this.translations.get(this.getKey());
    }

    public async getTranslations(keys: ITranslationLocation[]): Promise<ITranslationLocation[]> {
        const translations = await this.fetchTranslations();
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
    }

    public findTranslationKeys(document: TextDocument): ITranslationLocation[] {
        const matches: ITranslationLocation[] = [];
        const regex = this.translationRegex;

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            let match: RegExpExecArray | null;
            regex.lastIndex = 0;

            while ((match = regex.exec(line.text))) {
                if (!match && !match[1]) return;

                matches.push({
                    range: new Range(
                        i,
                        match.index,
                        i,
                        match.index + match[1].length
                    ),
                    text: match[1]
                });
            }
        }
        return matches;
    }
}