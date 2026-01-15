
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * Environment variables [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env`. Like [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), this module cannot be imported into client-side code. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * _Unlike_ [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), the values exported from this module are statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * ```ts
 * import { API_KEY } from '$env/static/private';
 * ```
 * 
 * Note that all environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * 
 * ```
 * MY_FEATURE_FLAG=""
 * ```
 * 
 * You can override `.env` values from the command line like so:
 * 
 * ```sh
 * MY_FEATURE_FLAG="enabled" npm run dev
 * ```
 */
declare module '$env/static/private' {
	export const NVM_INC: string;
	export const KARAKEEP_SERVER_ADDR: string;
	export const HOMEBREW_PROCESSOR: string;
	export const HOMEBREW_BREW_DEFAULT_GIT_REMOTE: string;
	export const HOMEBREW_DEFAULT_CACHE: string;
	export const HOMEBREW_MACOS_OLDEST_ALLOWED: string;
	export const TERM_PROGRAM: string;
	export const HOMEBREW_USER_AGENT: string;
	export const NODE: string;
	export const HOMEBREW_LIVECHECK_AUTOBUMP: string;
	export const INIT_CWD: string;
	export const _P9K_TTY: string;
	export const NVM_CD_FLAGS: string;
	export const HOMEBREW_LIBRARY: string;
	export const HOMEBREW_COMMAND_DEPTH: string;
	export const HOMEBREW_AUTO_UPDATE_CHECKED: string;
	export const SHELL: string;
	export const HOMEBREW_TEMP: string;
	export const TERM: string;
	export const HOMEBREW_OS_VERSION: string;
	export const TMPDIR: string;
	export const HOMEBREW_REPOSITORY: string;
	export const HOMEBREW_SORBET_RUNTIME: string;
	export const HOMEBREW_GIT_EMAIL: string;
	export const npm_config_npm_globalconfig: string;
	export const VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
	export const TERM_PROGRAM_VERSION: string;
	export const FLURO_ACCOUNT: string;
	export const HOMEBREW_PHYSICAL_PROCESSOR: string;
	export const VSCODE_PREVENT_SHELL_HISTORY: string;
	export const ZDOTDIR: string;
	export const FIG_NEW_SESSION: string;
	export const MallocNanoZone: string;
	export const TERM_SESSION_ID: string;
	export const npm_config_registry: string;
	export const FLURO_PASSWORD: string;
	export const HOMEBREW_RUBY_PATH: string;
	export const PNPM_HOME: string;
	export const ZSH: string;
	export const LC_ALL: string;
	export const HOMEBREW_MACOS_NEWEST_SUPPORTED: string;
	export const GIT_EDITOR: string;
	export const HOMEBREW_RUBY_WARNINGS: string;
	export const HOMEBREW_MACOS_OLDEST_SUPPORTED: string;
	export const NVM_DIR: string;
	export const HOMEBREW_PATH: string;
	export const USER: string;
	export const LS_COLORS: string;
	export const HOMEBREW_DEVELOPER: string;
	export const HOMEBREW_BUNDLER_VERSION: string;
	export const COMMAND_MODE: string;
	export const PNPM_SCRIPT_SRC_DIR: string;
	export const npm_config_globalconfig: string;
	export const CW_NEW_SESSION: string;
	export const HOMEBREW_GENERIC_DEFAULT_PREFIX: string;
	export const HOMEBREW_CORE_GIT_REMOTE: string;
	export const SSH_AUTH_SOCK: string;
	export const HOMEBREW_NO_UNINSTALL_ON_CASK_UPGRADE: string;
	export const VSCODE_PROFILE_INITIALIZED: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const npm_execpath: string;
	export const TERM_FEATURES: string;
	export const HOMEBREW_USER_CONFIG_HOME: string;
	export const HOMEBREW_DEVELOPER_COMMAND: string;
	export const HOMEBREW_MINIMUM_GIT_VERSION: string;
	export const PAGER: string;
	export const GITSTATUS_LOG_LEVEL: string;
	export const HOMEBREW_CURL_SPEED_LIMIT: string;
	export const HOMEBREW_CACHE: string;
	export const HOMEBREW_RUBY_DISABLE_OPTIONS: string;
	export const npm_config_verify_deps_before_run: string;
	export const npm_config_frozen_lockfile: string;
	export const LSCOLORS: string;
	export const HOMEBREW_DEFAULT_LOGS: string;
	export const PERSONAL_GITHUB_TOKEN: string;
	export const HOMEBREW_TMPDIR: string;
	export const HOMEBREW_USER_AGENT_CURL: string;
	export const KARAKEEP_API_KEY: string;
	export const TERMINFO_DIRS: string;
	export const PATH: string;
	export const HOMEBREW_BREWED_CURL_PATH: string;
	export const HOMEBREW_BOOTSNAP_GEM_PATH: string;
	export const npm_package_json: string;
	export const npm_config_engine_strict: string;
	export const HOMEBREW_EDITOR: string;
	export const USER_ZDOTDIR: string;
	export const __CFBundleIdentifier: string;
	export const npm_command: string;
	export const HOMEBREW_DISPLAY_INSTALL_TIMES: string;
	export const HOMEBREW_BREW_FILE: string;
	export const PWD: string;
	export const VSCODE_NONCE: string;
	export const TMDB_API_KEY: string;
	export const HOMEBREW_GITHUB_API_TOKEN: string;
	export const HOMEBREW_MACOS_VERSION_NUMERIC: string;
	export const HOMEBREW_DEFAULT_PREFIX: string;
	export const HOMEBREW_MACOS_VERSION: string;
	export const npm_lifecycle_event: string;
	export const npm_config__jsr_registry: string;
	export const P9K_SSH: string;
	export const EDITOR: string;
	export const HOMEBREW_COLORTERM: string;
	export const npm_package_name: string;
	export const P9K_TTY: string;
	export const LANG: string;
	export const PYTHONSTARTUP: string;
	export const ITERM_PROFILE: string;
	export const HOMEBREW_NO_INSTALL_FROM_API: string;
	export const NODE_PATH: string;
	export const HOMEBREW_GIT_NAME: string;
	export const VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
	export const XPC_FLAGS: string;
	export const HOMEBREW_OPEN_AFTER_INSTALL: string;
	export const HOMEBREW_REQUIRED_RUBY_VERSION: string;
	export const HOMEBREW_DEFAULT_TEMP: string;
	export const FLURO_USERNAME: string;
	export const HOMEBREW_PRODUCT: string;
	export const HOMEBREW_INSTALL_BADGE: string;
	export const npm_config_node_gyp: string;
	export const pnpm_config_verify_deps_before_run: string;
	export const npm_package_version: string;
	export const XPC_SERVICE_NAME: string;
	export const HOMEBREW_CASKROOM: string;
	export const VSCODE_INJECTION: string;
	export const HOMEBREW_GITHUB_PACKAGES_AUTH: string;
	export const COLORFGBG: string;
	export const PYENV_SHELL: string;
	export const HOME: string;
	export const SHLVL: string;
	export const VSCODE_GIT_ASKPASS_MAIN: string;
	export const HOMEBREW_CURL_SPEED_TIME: string;
	export const HOMEBREW_BREW_GIT_REMOTE: string;
	export const PYTHON_BASIC_REPL: string;
	export const LC_TERMINAL_VERSION: string;
	export const HOMEBREW_PREFIX: string;
	export const HOMEBREW_API_DEFAULT_DOMAIN: string;
	export const HOMEBREW_ORIGINAL_BREW_FILE: string;
	export const HOMEBREW_BOTTLE_DEFAULT_DOMAIN: string;
	export const ITERM_SESSION_ID: string;
	export const LESS: string;
	export const LOGNAME: string;
	export const npm_lifecycle_script: string;
	export const HOMEBREW_GIT: string;
	export const HOMEBREW_DOWNLOAD_CONCURRENCY: string;
	export const VSCODE_GIT_IPC_HANDLE: string;
	export const HOMEBREW_LOGS: string;
	export const HOMEBREW_HELP_MESSAGE: string;
	export const HOMEBREW_DEFAULT_REPOSITORY: string;
	export const NVM_BIN: string;
	export const GITHUB_TOKEN: string;
	export const HOMEBREW_CORE_DEFAULT_GIT_REMOTE: string;
	export const npm_config_user_agent: string;
	export const HOMEBREW_VERSION: string;
	export const BUNDLER_NO_OLD_RUBYGEMS_WARNING: string;
	export const VSCODE_GIT_ASKPASS_NODE: string;
	export const GIT_ASKPASS: string;
	export const INFOPATH: string;
	export const HOMEBREW_CELLAR: string;
	export const LC_TERMINAL: string;
	export const _P9K_SSH_TTY: string;
	export const HOMEBREW_CURL: string;
	export const Q_NEW_SESSION: string;
	export const OSLogRateLimit: string;
	export const npm_config_trust_policy: string;
	export const GIT_PAGER: string;
	export const HOMEBREW_MACOS_NEWEST_UNSUPPORTED: string;
	export const HOMEBREW_GENERIC_DEFAULT_REPOSITORY: string;
	export const HOMEBREW_NO_ENV_HINTS: string;
	export const npm_node_execpath: string;
	export const npm_config_shell_emulator: string;
	export const GH_TOKEN: string;
	export const COLORTERM: string;
	export const BUNDLER_VERSION: string;
	export const HOMEBREW_SYSTEM: string;
	export const NODE_ENV: string;
}

/**
 * Similar to [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private), except that it only includes environment variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Values are replaced statically at build time.
 * 
 * ```ts
 * import { PUBLIC_BASE_URL } from '$env/static/public';
 * ```
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to runtime environment variables, as defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * This module cannot be imported into client-side code.
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * console.log(env.DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` always includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 */
declare module '$env/dynamic/private' {
	export const env: {
		NVM_INC: string;
		KARAKEEP_SERVER_ADDR: string;
		HOMEBREW_PROCESSOR: string;
		HOMEBREW_BREW_DEFAULT_GIT_REMOTE: string;
		HOMEBREW_DEFAULT_CACHE: string;
		HOMEBREW_MACOS_OLDEST_ALLOWED: string;
		TERM_PROGRAM: string;
		HOMEBREW_USER_AGENT: string;
		NODE: string;
		HOMEBREW_LIVECHECK_AUTOBUMP: string;
		INIT_CWD: string;
		_P9K_TTY: string;
		NVM_CD_FLAGS: string;
		HOMEBREW_LIBRARY: string;
		HOMEBREW_COMMAND_DEPTH: string;
		HOMEBREW_AUTO_UPDATE_CHECKED: string;
		SHELL: string;
		HOMEBREW_TEMP: string;
		TERM: string;
		HOMEBREW_OS_VERSION: string;
		TMPDIR: string;
		HOMEBREW_REPOSITORY: string;
		HOMEBREW_SORBET_RUNTIME: string;
		HOMEBREW_GIT_EMAIL: string;
		npm_config_npm_globalconfig: string;
		VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
		TERM_PROGRAM_VERSION: string;
		FLURO_ACCOUNT: string;
		HOMEBREW_PHYSICAL_PROCESSOR: string;
		VSCODE_PREVENT_SHELL_HISTORY: string;
		ZDOTDIR: string;
		FIG_NEW_SESSION: string;
		MallocNanoZone: string;
		TERM_SESSION_ID: string;
		npm_config_registry: string;
		FLURO_PASSWORD: string;
		HOMEBREW_RUBY_PATH: string;
		PNPM_HOME: string;
		ZSH: string;
		LC_ALL: string;
		HOMEBREW_MACOS_NEWEST_SUPPORTED: string;
		GIT_EDITOR: string;
		HOMEBREW_RUBY_WARNINGS: string;
		HOMEBREW_MACOS_OLDEST_SUPPORTED: string;
		NVM_DIR: string;
		HOMEBREW_PATH: string;
		USER: string;
		LS_COLORS: string;
		HOMEBREW_DEVELOPER: string;
		HOMEBREW_BUNDLER_VERSION: string;
		COMMAND_MODE: string;
		PNPM_SCRIPT_SRC_DIR: string;
		npm_config_globalconfig: string;
		CW_NEW_SESSION: string;
		HOMEBREW_GENERIC_DEFAULT_PREFIX: string;
		HOMEBREW_CORE_GIT_REMOTE: string;
		SSH_AUTH_SOCK: string;
		HOMEBREW_NO_UNINSTALL_ON_CASK_UPGRADE: string;
		VSCODE_PROFILE_INITIALIZED: string;
		__CF_USER_TEXT_ENCODING: string;
		npm_execpath: string;
		TERM_FEATURES: string;
		HOMEBREW_USER_CONFIG_HOME: string;
		HOMEBREW_DEVELOPER_COMMAND: string;
		HOMEBREW_MINIMUM_GIT_VERSION: string;
		PAGER: string;
		GITSTATUS_LOG_LEVEL: string;
		HOMEBREW_CURL_SPEED_LIMIT: string;
		HOMEBREW_CACHE: string;
		HOMEBREW_RUBY_DISABLE_OPTIONS: string;
		npm_config_verify_deps_before_run: string;
		npm_config_frozen_lockfile: string;
		LSCOLORS: string;
		HOMEBREW_DEFAULT_LOGS: string;
		PERSONAL_GITHUB_TOKEN: string;
		HOMEBREW_TMPDIR: string;
		HOMEBREW_USER_AGENT_CURL: string;
		KARAKEEP_API_KEY: string;
		TERMINFO_DIRS: string;
		PATH: string;
		HOMEBREW_BREWED_CURL_PATH: string;
		HOMEBREW_BOOTSNAP_GEM_PATH: string;
		npm_package_json: string;
		npm_config_engine_strict: string;
		HOMEBREW_EDITOR: string;
		USER_ZDOTDIR: string;
		__CFBundleIdentifier: string;
		npm_command: string;
		HOMEBREW_DISPLAY_INSTALL_TIMES: string;
		HOMEBREW_BREW_FILE: string;
		PWD: string;
		VSCODE_NONCE: string;
		TMDB_API_KEY: string;
		HOMEBREW_GITHUB_API_TOKEN: string;
		HOMEBREW_MACOS_VERSION_NUMERIC: string;
		HOMEBREW_DEFAULT_PREFIX: string;
		HOMEBREW_MACOS_VERSION: string;
		npm_lifecycle_event: string;
		npm_config__jsr_registry: string;
		P9K_SSH: string;
		EDITOR: string;
		HOMEBREW_COLORTERM: string;
		npm_package_name: string;
		P9K_TTY: string;
		LANG: string;
		PYTHONSTARTUP: string;
		ITERM_PROFILE: string;
		HOMEBREW_NO_INSTALL_FROM_API: string;
		NODE_PATH: string;
		HOMEBREW_GIT_NAME: string;
		VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
		XPC_FLAGS: string;
		HOMEBREW_OPEN_AFTER_INSTALL: string;
		HOMEBREW_REQUIRED_RUBY_VERSION: string;
		HOMEBREW_DEFAULT_TEMP: string;
		FLURO_USERNAME: string;
		HOMEBREW_PRODUCT: string;
		HOMEBREW_INSTALL_BADGE: string;
		npm_config_node_gyp: string;
		pnpm_config_verify_deps_before_run: string;
		npm_package_version: string;
		XPC_SERVICE_NAME: string;
		HOMEBREW_CASKROOM: string;
		VSCODE_INJECTION: string;
		HOMEBREW_GITHUB_PACKAGES_AUTH: string;
		COLORFGBG: string;
		PYENV_SHELL: string;
		HOME: string;
		SHLVL: string;
		VSCODE_GIT_ASKPASS_MAIN: string;
		HOMEBREW_CURL_SPEED_TIME: string;
		HOMEBREW_BREW_GIT_REMOTE: string;
		PYTHON_BASIC_REPL: string;
		LC_TERMINAL_VERSION: string;
		HOMEBREW_PREFIX: string;
		HOMEBREW_API_DEFAULT_DOMAIN: string;
		HOMEBREW_ORIGINAL_BREW_FILE: string;
		HOMEBREW_BOTTLE_DEFAULT_DOMAIN: string;
		ITERM_SESSION_ID: string;
		LESS: string;
		LOGNAME: string;
		npm_lifecycle_script: string;
		HOMEBREW_GIT: string;
		HOMEBREW_DOWNLOAD_CONCURRENCY: string;
		VSCODE_GIT_IPC_HANDLE: string;
		HOMEBREW_LOGS: string;
		HOMEBREW_HELP_MESSAGE: string;
		HOMEBREW_DEFAULT_REPOSITORY: string;
		NVM_BIN: string;
		GITHUB_TOKEN: string;
		HOMEBREW_CORE_DEFAULT_GIT_REMOTE: string;
		npm_config_user_agent: string;
		HOMEBREW_VERSION: string;
		BUNDLER_NO_OLD_RUBYGEMS_WARNING: string;
		VSCODE_GIT_ASKPASS_NODE: string;
		GIT_ASKPASS: string;
		INFOPATH: string;
		HOMEBREW_CELLAR: string;
		LC_TERMINAL: string;
		_P9K_SSH_TTY: string;
		HOMEBREW_CURL: string;
		Q_NEW_SESSION: string;
		OSLogRateLimit: string;
		npm_config_trust_policy: string;
		GIT_PAGER: string;
		HOMEBREW_MACOS_NEWEST_UNSUPPORTED: string;
		HOMEBREW_GENERIC_DEFAULT_REPOSITORY: string;
		HOMEBREW_NO_ENV_HINTS: string;
		npm_node_execpath: string;
		npm_config_shell_emulator: string;
		GH_TOKEN: string;
		COLORTERM: string;
		BUNDLER_VERSION: string;
		HOMEBREW_SYSTEM: string;
		NODE_ENV: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * Similar to [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), but only includes variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Note that public dynamic environment variables must all be sent from the server to the client, causing larger network requests — when possible, use `$env/static/public` instead.
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.PUBLIC_DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
