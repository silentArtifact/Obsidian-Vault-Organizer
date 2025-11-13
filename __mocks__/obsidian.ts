/**
 * Mock implementation of Obsidian API for testing.
 */

export const normalizePath = (path: string): string => {
	return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
};

export class Notice {
	constructor(public message: string, public timeout?: number) {}
}

export class Plugin {
	app: any;
	manifest: any;

	async loadData(): Promise<any> {
		return {};
	}

	async saveData(data: any): Promise<void> {}

	addCommand(command: any): void {}

	addSettingTab(tab: any): void {}

	registerEvent(event: any): void {}
}

export class Modal {
	app: any;
	contentEl: any;
	private elements: any[] = [];

	constructor() {
		const createMockElement = (): any => {
			const element: any = {
				innerHTML: '',
				textContent: '',
				style: {},
				onclick: null,
				createEl: jest.fn((tag: string, options?: any) => {
					const child = createMockElement();
					if (options?.text) child.textContent = options.text;
					if (options?.cls) child.className = options.cls;
					element.textContent += options?.text || '';
					return child;
				}),
				createSpan: jest.fn((options?: any) => {
					const child = createMockElement();
					if (options?.text) {
						child.textContent = options.text;
						element.textContent += options.text;
					}
					return child;
				}),
				createDiv: jest.fn((options?: any) => {
					const child = createMockElement();
					if (options?.cls) child.className = options.cls;
					return child;
				}),
				empty: jest.fn(() => {
					element.innerHTML = '';
					element.textContent = '';
				}),
				querySelectorAll: jest.fn(() => []),
			};
			return element;
		};

		this.contentEl = createMockElement();
	}

	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export class PluginSettingTab {
	app: any;
	plugin: any;
	containerEl: any = {
		empty: jest.fn(),
		querySelector: jest.fn(),
		querySelectorAll: jest.fn(() => []),
	};

	constructor(app: any, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}

	display(): void {}
	hide(): void {}
}

export class Setting {
	settingEl: any = {
		classList: {
			add: jest.fn(),
			remove: jest.fn(),
			toggle: jest.fn(),
		},
		appendChild: jest.fn(),
	};

	constructor(public containerEl: any) {}

	setName(name: string): this {
		return this;
	}

	setDesc(desc: string): this {
		return this;
	}

	addText(cb: (text: any) => void): this {
		const text = {
			setPlaceholder: jest.fn().mockReturnThis(),
			setValue: jest.fn().mockReturnThis(),
			onChange: jest.fn().mockReturnThis(),
			getValue: jest.fn(() => ''),
			inputEl: {
				toggleAttribute: jest.fn(),
				disabled: false,
				style: { display: '' },
			},
		};
		cb(text);
		return this;
	}

	addDropdown(cb: (dropdown: any) => void): this {
		const dropdown = {
			addOption: jest.fn().mockReturnThis(),
			setValue: jest.fn().mockReturnThis(),
			onChange: jest.fn().mockReturnThis(),
			selectEl: {
				setAttribute: jest.fn(),
			},
		};
		cb(dropdown);
		return this;
	}

	addToggle(cb: (toggle: any) => void): this {
		const toggle = {
			setValue: jest.fn().mockReturnThis(),
			onChange: jest.fn().mockReturnThis(),
			setTooltip: jest.fn().mockReturnThis(),
			toggleEl: {
				style: { display: '' },
			},
		};
		cb(toggle);
		return this;
	}

	addButton(cb: (button: any) => void): this {
		const button = {
			setButtonText: jest.fn().mockReturnThis(),
			onClick: jest.fn().mockReturnThis(),
		};
		cb(button);
		return this;
	}

	addExtraButton(cb: (button: any) => void): this {
		const button = {
			setIcon: jest.fn().mockReturnThis(),
			setTooltip: jest.fn().mockReturnThis(),
			setDisabled: jest.fn().mockReturnThis(),
			onClick: jest.fn().mockReturnThis(),
		};
		cb(button);
		return this;
	}
}

export class FuzzySuggestModal<T> extends Modal {
	constructor(app: any) {
		super();
		this.app = app;
	}

	getItems(): T[] {
		return [];
	}

	getItemText(item: T): string {
		return String(item);
	}

	onChooseItem(item: T, evt: any): void {}
}

export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;
	stat: any = {};
	vault: any = {};

	constructor(path?: string) {
		this.path = path || '';
		this.name = path ? path.split('/').pop()! : '';
		const parts = this.name.split('.');
		this.basename = parts.length > 1 ? parts.slice(0, -1).join('.') : this.name;
		this.extension = parts.length > 1 ? parts.pop()! : '';
	}
}

export class TAbstractFile {
	path: string = '';
	name: string = '';
	parent: any = null;
}

export const debounce = (fn: any, delay: number) => {
	const debounced = fn;
	debounced.cancel = jest.fn();
	return debounced;
};

export const getAllTags = jest.fn(() => []);

export interface CachedMetadata {
	frontmatter?: Record<string, any>;
	tags?: any[];
}

export interface App {
	vault: any;
	metadataCache: any;
}

export type TextComponent = any;
