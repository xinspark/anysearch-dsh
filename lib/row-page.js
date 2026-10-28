/**
 * Client (browser) half of `@anysearch/anysearch-dsh`.
 *
 * The provider is a Host-plane plugin; the one thing a browser can add for it is
 * the API-key row on the plugin's own page in the Plugins section. DSH gives a
 * bundle row a "Configure" control only while some Client half claims the keyed
 * `plugins.row.config` slot under `<package name>#<row id>`, so this file claims
 * this package's own row — the id `cordis.patch.yml` declares.
 *
 * The key never enters a configuration file: it is written through the official
 * `ctx.remote.credentials` namespace into the Host's managed credentials
 * document. The reference is the entry's own `apiKeyEnv` — the volatile config
 * value the Plugins page hands this row — falling back to the provider's
 * documented default (`ANYSEARCH_API_KEY`) only when the owner delivers no form.
 * The provider re-resolves that reference on every search, so a saved (or
 * cleared) key applies to the next search with no restart, and re-pointing
 * `apiKeyEnv` moves the row and the provider together instead of splitting them.
 *
 * Artifact form: the browser module table loads a classic script that registers a
 * lazy factory with `window.__ModuleLoader__.load`. This source is therefore a
 * global script — no imports, no exports — which the existing `tsc` build emits
 * verbatim, so no Client bundler is added to this repository. The IIFE keeps
 * every name out of the page's global namespace and out of the generated
 * declaration file.
 *
 * A second contribution, `plugins.detail.section`, reports which provider the
 * native `web_search` / `web_fetch` resolve and offers the one reversible
 * switch. It reads and writes through the official `ctx.configForms` service —
 * the same settings mirror every official settings page derives from — so no
 * profile patch is parsed and no write path is invented here.
 */
void (function anysearchApiKeyRow() {
    /** Package name; also the id this Client artifact must register its factory under. */
    const PACKAGE = '@anysearch/anysearch-dsh';
    /** Row id this package's bundle patch declares — the row whose page this registers. */
    const ROW_ID = 'web-search-anysearch';
    /** `plugins.row.config` key: `<package name>#<row id>`. */
    const ROW_KEY = `${PACKAGE}#${ROW_ID}`;
    /**
     * Reference this row manages when the row configuration names no usable one
     * (no form, an empty value, or a blank/non-string `apiKeyEnv`). Spelled out
     * rather than imported: a Client half must not depend on a Host package, and
     * this is the provider's documented `apiKeyEnv` default (`src/index.ts`) —
     * which falls back the same way, so both halves agree. A configured
     * `apiKeyEnv` wins over it; see {@link credentialRefOf}.
     */
    const DEFAULT_API_KEY_REF = 'ANYSEARCH_API_KEY';
    /** Dictionary namespace owned by this page. */
    const NS = 'settings.anysearchApiKey';
    /**
     * This plugin's provider id. The Host half registers the same id for native
     * search and native fetch, so one switch covers both tools.
     */
    const ANYSEARCH_PROVIDER = 'anysearch';
    /**
     * The pair the native Web-search settings switch writes for its "Search API"
     * mode — copied from that page's own `PROVIDERS` map
     * (`@deepseek-ai/dsh-client-ui-settings-web-search`). The other official mode
     * is `deepseek-official` / `http` (Messages search + local HTTP fetch); this
     * card restores the Search API pair because that is the switch's own default
     * target, and it is a native constant rather than a guess about a deployment.
     */
    const OFFICIAL_PROVIDERS = {
        searchProvider: 'deepseek-search-api',
        fetchProvider: 'deepseek-fetch-api',
    };
    /**
     * Resolve the shared primitives module, or `undefined` when the host's web
     * client no longer serves the id. `require` throws inside the module-loader
     * factory when the specifier is absent from the client bundle's registry —
     * that throw must never escape the factory (it would break the whole page
     * at materialization), so every call site gets an explicit degrade path.
     */
    function tryRequirePrimitives(require) {
        try {
            const mod = require('@deepseek-ai/dsh-client-ui-primitives');
            if (mod === undefined ||
                mod.SettingsForm === undefined ||
                mod.SettingsSecretField === undefined ||
                mod.Button === undefined) {
                return undefined;
            }
            return mod;
        }
        catch {
            return undefined;
        }
    }
    /** Simplified Chinese copy. */
    const zh = {
        summary: '用你自己的 AnySearch 凭据驱动 web_search（匿名也能搜，配的是限额）。',
        apiKey: 'API Key',
        apiKeyHint: '写入凭据文件的 {ref}；留空表示保持当前密钥。',
        keySet: '已配置密钥',
        keyUnset: '未配置（匿名限额）',
        loading: '正在读取凭据状态…',
        loadFailed: '读取凭据状态失败。',
        unavailable: '本部署没有提供凭据服务，无法在这里写入密钥。',
        readOnly: '凭据来源是只读的，无法在这里写入。',
        uiUnavailable: '当前 dsh web 前端不提供本页依赖的界面组件（client-ui-primitives），请升级 dsh 后重试。',
        save: '保存',
        saving: '保存中…',
        saved: '已保存，下一次搜索即生效。',
        clear: '清除密钥',
        clearConfirm: '确认清除',
        clearCancel: '取消',
        cleared: '已清除密钥；搜索回到匿名限额。',
        clearFailed: '清除失败：',
        webSourceTitle: '原生搜索源',
        webSourceSearch: 'web_search',
        webSourceFetch: 'web_fetch',
        webSourceLayer: '配置来源',
        webSourceProfile: '本 profile 的补丁覆盖',
        webSourceBundle: 'bundle 默认（未被覆盖）',
        webSourceNone: '未指定（按注册情况自动选择）',
        webSourceAnysearch: '原生工具当前由 AnySearch 提供。',
        webSourceOther: '原生工具当前未指向 AnySearch。',
        webSourceSwitch: '切换为 AnySearch',
        webSourceRestore: '恢复官方 provider',
        webSourceBusy: '正在写入…',
        webSourceRefused: '写入未成功；配置可能在别处被改动，已重新读取。',
        webSourceReadOnly: '当前配置只读，无法在这里切换。',
        webSourceLoading: '正在读取搜索源状态…',
        webSourceUnavailable: '本部署没有把这个原生搜索源暴露成可编辑配置，因此无法在这里显示或切换。',
        webSourceHint: '这两个字段是 volatile：切换后下一次搜索即生效，无需重启。若本插件被停用，原生工具会报 WEB_PROVIDER_CONFIGURED_MISSING。',
    };
    /** English copy; keys must match `zh` exactly. */
    const en = {
        summary: 'Drives web_search with your own AnySearch credential (anonymous works too, at lower limits).',
        apiKey: 'API key',
        apiKeyHint: 'Stores the {ref} credential; leave blank to keep the current key.',
        keySet: 'A key is configured',
        keyUnset: 'No key (anonymous limits)',
        loading: 'Reading credential state…',
        loadFailed: 'Could not read the credential state.',
        unavailable: 'This deployment serves no credential service, so a key cannot be written here.',
        readOnly: 'The credential source is read-only, so a key cannot be written here.',
        uiUnavailable: 'This dsh web frontend does not serve the UI components (client-ui-primitives) this page renders with; upgrade dsh and retry.',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Saved; it applies to the next search.',
        clear: 'Clear key',
        clearConfirm: 'Clear it',
        clearCancel: 'Cancel',
        cleared: 'Key cleared; searches are back to the anonymous limits.',
        clearFailed: 'Clear failed: ',
        webSourceTitle: 'Native provider',
        webSourceSearch: 'web_search',
        webSourceFetch: 'web_fetch',
        webSourceLayer: 'Configuration layer',
        webSourceProfile: 'Overridden by this profile patch',
        webSourceBundle: 'Bundle default (not overridden)',
        webSourceNone: 'not specified (picked from what is registered)',
        webSourceAnysearch: 'AnySearch currently serves the native tools.',
        webSourceOther: 'The native tools do not point at AnySearch.',
        webSourceSwitch: 'Switch to AnySearch',
        webSourceRestore: 'Restore the official providers',
        webSourceBusy: 'Writing…',
        webSourceRefused: 'The write did not go through; the configuration may have changed elsewhere and has been re-read.',
        webSourceReadOnly: 'This configuration is read-only; it cannot be switched here.',
        webSourceLoading: 'Reading the provider state…',
        webSourceUnavailable: 'This deployment does not expose the native provider selection as an editable form, so it cannot be shown or switched here.',
        webSourceHint: 'Both fields are volatile: the next search applies the switch, with no restart. If this plugin is disabled, the native tools report WEB_PROVIDER_CONFIGURED_MISSING.',
    };
    /** Flatten anything thrown — an Error, a Remote refusal, or a bare object — into one line of copy. */
    function messageOf(error) {
        if (error === undefined || error === null)
            return '';
        if (typeof error === 'string')
            return error;
        if (typeof error === 'object') {
            const message = error.message;
            if (typeof message === 'string' && message.length > 0)
                return message;
        }
        return String(error);
    }
    /** The one notice line under the form, or `''` when there is nothing to say. */
    function noticeOf(loaded, phase, failure, t) {
        if (loaded && phase === 'saved')
            return t('saved');
        if (loaded && phase === 'cleared')
            return t('cleared');
        return phase === 'failed' ? failure : '';
    }
    /**
     * The credential reference this page manages: the row's configured `apiKeyEnv`,
     * or the provider's default whenever that configuration names no usable one.
     * Reading it from the row's own configuration is what keeps a re-pointed
     * reference from splitting the GUI away from the provider.
     */
    function credentialRefOf(form) {
        const declared = form?.state?.value?.apiKeyEnv;
        // A volatile field reaches the page as a live reference rather than a plain
        // string (`get()`), exactly as the Host half receives it; a plain string is
        // what a configuration file states. Both are read the same way here.
        const value = typeof declared === 'string'
            ? declared
            : declared !== null && typeof declared === 'object' && typeof declared.get === 'function'
                ? declared.get()
                : '';
        // A blank or whitespace-only name is not a reference the provider could
        // resolve, so treat it as absent rather than writing an unusable ref.
        const name = typeof value === 'string' ? value.trim() : '';
        return name.length > 0 ? name : DEFAULT_API_KEY_REF;
    }
    /**
     * The deployment serves no credential service. Distinct from every other
     * failure so the page can say so in the user's language instead of pasting a
     * developer-facing sentence about `ctx.remote`.
     */
    class CredentialsUnavailableError extends Error {
        constructor() {
            super('ctx.remote.credentials is unavailable in this deployment');
            this.name = 'CredentialsUnavailableError';
        }
    }
    /** Resolve the credentials namespace, or fail with something a reader can act on. */
    function credentialsSeam(ctx) {
        const seam = ctx.remote === undefined ? undefined : ctx.remote.credentials;
        if (seam === undefined ||
            typeof seam.describe !== 'function' ||
            typeof seam.set !== 'function' ||
            typeof seam.unset !== 'function') {
            throw new CredentialsUnavailableError();
        }
        return seam;
    }
    /**
     * A Remote refusal arrives either as a `{ok: false}` envelope or as a throw;
     * both become one exception the page turns into its failure copy.
     */
    function unwrap(result, method) {
        if (result === undefined || result === null || result.ok === undefined || result.ok === true)
            return result;
        throw new Error(messageOf(result.error) || `${method} was refused`);
    }
    /** Read whether the reference this row writes currently holds a key, and whether it is writable. */
    async function readCredential(ctx, ref) {
        const response = unwrap(await credentialsSeam(ctx).describe([ref]), 'credentials.describe');
        const view = response === undefined || response.value === undefined ? undefined : response.value[ref];
        return {
            configured: view !== undefined && view.configured === true,
            writable: !(view !== undefined && view.writable === false),
        };
    }
    /** Whether an object layer carries the named field (the layer may be absent). */
    function layerHas(layer, field) {
        return layer !== null && typeof layer === 'object' && field in layer;
    }
    /**
     * Whether a serialized schemastery envelope declares the named field.
     *
     * The wire shape is a reference envelope — `{uid, refs: {"4": {type:"object",
     * dict: {searchProvider: 1}}}}` — not the live schema's own `dict`, so a
     * direct `schema.dict` lookup finds nothing (verified against schemastery
     * 3.18.5). Walk the envelope instead of assuming one layout.
     */
    function schemaDeclares(schema, field) {
        const seen = new Set();
        const visit = (node) => {
            if (node === null || typeof node !== 'object' || seen.has(node))
                return false;
            seen.add(node);
            const record = node;
            for (const key of ['dict', 'properties']) {
                const map = record[key];
                if (map !== null && typeof map === 'object' && field in map)
                    return true;
            }
            for (const value of Object.values(record)) {
                if (value !== null && typeof value === 'object' && visit(value))
                    return true;
            }
            return false;
        };
        return visit(schema);
    }
    /**
     * The Host entry whose shared form carries the native web provider selection.
     *
     * Two independent facts identify it, because either can be absent: the
     * resolved `value` keys (the entry's live selection) and the serialized
     * schema (which still names the fields when neither is configured). Never a
     * guessed entry id.
     */
    function webEntryOf(forms) {
        const snapshot = forms.describe().getSnapshot();
        for (const row of snapshot?.view?.namespaces ?? []) {
            if (layerHas(row.value, 'searchProvider') || layerHas(row.value, 'fetchProvider'))
                return row.ns;
        }
        for (const row of snapshot?.view?.namespaces ?? []) {
            if (schemaDeclares(row.schema, 'searchProvider'))
                return row.ns;
        }
        return undefined;
    }
    /** One string field out of a form value layer, or '' when it is absent. */
    function fieldOf(layer, field) {
        const value = layer === undefined ? undefined : layer[field];
        return typeof value === 'string' ? value : '';
    }
    /** Fold one form snapshot into the section's facts. */
    function webSourceOf(snapshot) {
        const search = fieldOf(snapshot.value, 'searchProvider');
        const fetchProvider = fieldOf(snapshot.value, 'fetchProvider');
        const user = snapshot.user ?? {};
        return {
            search,
            fetch: fetchProvider,
            overridden: user.searchProvider !== undefined || user.fetchProvider !== undefined,
            pointing: search === ANYSEARCH_PROVIDER && fetchProvider === ANYSEARCH_PROVIDER,
        };
    }
    /**
     * The snapshot the section reports while the Host serves no web form. A stable
     * object on purpose: a fresh `{status:'absent'}` per read would make React's
     * external-store check see a change on every render.
     */
    const ABSENT_SNAPSHOT = { status: 'absent' };
    /** The snapshot shown while the mirror's first describe read is in flight. */
    const LOADING_SNAPSHOT = { status: 'loading' };
    // `any` on the `require` result is the module table's own contract: it hands
    // back an untyped module namespace, and every React surface this page touches
    // is re-typed below (`useState`, `useEffect`, `useRef`, `useCallback`) before
    // the component body sees it. Naming one concrete type here would only narrow
    // the seam without checking anything.
    const loader = globalThis.__ModuleLoader__;
    if (loader === undefined)
        return;
    loader.load({
        id: PACKAGE,
        factory(require) {
            const React = require('react');
            const h = React.createElement;
            // The shared primitives specifier is resolved try-style, on purpose.
            // The npm package left the host's dependency graph in dsh 0.2.1 (the
            // web client UI rework folded it into the core bundle), but the module
            // id itself lives on in the deployed web client's specifier table —
            // every official settings page, including rc.2's own web-search
            // settings page, requires the exact same specifier inside the same
            // `__ModuleLoader__` factory pattern. Should a future host drop the id
            // after all, a throwing factory would take this whole plugin page down
            // at materialization; the catch keeps the row alive and the card
            // degrades to a readable notice below.
            const primitives = tryRequirePrimitives(require);
            // `SettingsForm` stays part of the required set above (the host ships it),
            // but this card composes its own action row: the native footer holds one
            // action, and Save + Clear belong on one line.
            const SettingsSecretField = primitives?.SettingsSecretField;
            const Button = primitives?.Button;
            // `require` hands back untyped modules; these four bindings are the only
            // React surface this page uses, typed so the component body stays checked.
            const useState = React.useState;
            const useEffect = React.useEffect;
            const useRef = React.useRef;
            const useCallback = React.useCallback;
            const useSyncExternalStore = React.useSyncExternalStore;
            /** The row's configuration page: one write-only key field, plus the clear that removes it. */
            function ApiKeyCard(props) {
                const t = props.t;
                // The reference the provider resolves for this entry. It comes from the
                // row's configuration, so re-pointing `apiKeyEnv` moves this page with it.
                const ref = credentialRefOf(props.form);
                const [draft, setDraft] = useState({ ref, text: '' });
                const [credential, setCredential] = useState({ loaded: false, configured: false, writable: true, error: '' });
                const [phase, setPhase] = useState('idle');
                const [failure, setFailure] = useState('');
                const [confirming, setConfirming] = useState(false);
                const alive = useRef(true);
                /**
                 * The reference currently in force, readable from a closure that captured
                 * an older one — a save or clear still in flight when the row config
                 * re-points `apiKeyEnv`. Synced in an effect, never during render: a render
                 * can be discarded, and a ref written there could hold a reference that
                 * never committed.
                 */
                const inForce = useRef(ref);
                /**
                 * Identifies the newest read. A response only paints the badge while it is
                 * still the latest one issued, so an action's re-read and the effect's own
                 * read cannot resolve out of order and leave the older answer on screen.
                 */
                const readToken = useRef(0);
                useEffect(() => {
                    inForce.current = ref;
                    // Everything the page says belongs to the reference it was read for, so
                    // a re-point starts the page over: the badge goes back to "reading"
                    // (its Clear control is gated on `configured`), and an in-flight or
                    // settled action's phase/notice is dropped. Without the phase reset a
                    // save or clear that is still running would keep `busy` true forever,
                    // because the guard below skips its own `setPhase`.
                    setCredential({ loaded: false, configured: false, writable: true, error: '' });
                    setPhase('idle');
                    setFailure('');
                    setConfirming(false);
                }, [ref]);
                useEffect(() => {
                    // Set inside the effect body (not just cleared in the cleanup) so a
                    // StrictMode double-mount re-arms the sentinel instead of leaving
                    // the page permanently in the loading state.
                    alive.current = true;
                    return () => {
                        alive.current = false;
                    };
                }, []);
                /**
                 * Read the state of the reference now in force into the badge.
                 * `stillWanted` is required, not optional: both call sites — the effect
                 * below and the re-read `settle` triggers — must state a liveness rule, so
                 * an unguarded `load()` cannot look safe while letting a superseded read
                 * paint the badge. Each call also takes a read token: two reads can be in
                 * flight at once (an action's re-read racing the effect's), and the later
                 * one is the one that describes the reference now in force.
                 */
                const load = useCallback(async (stillWanted) => {
                    const token = ++readToken.current;
                    try {
                        const next = await props.describe(ref);
                        if (!alive.current || !stillWanted() || token !== readToken.current)
                            return;
                        setCredential({ loaded: true, configured: next.configured, writable: next.writable, error: '' });
                    }
                    catch (error) {
                        if (!alive.current || !stillWanted() || token !== readToken.current)
                            return;
                        // A failed read says nothing about writability, so the field is left
                        // editable: whoever typed here can still save (that write reports
                        // its own refusal), and a deployment that really is read-only
                        // refuses the write instead of leaving a dead form. The error text
                        // distinguishes "no seam" from anything else.
                        const missingSeam = error instanceof CredentialsUnavailableError;
                        setCredential({
                            loaded: false,
                            configured: false,
                            writable: true,
                            error: missingSeam ? t('unavailable') : messageOf(error),
                        });
                    }
                }, [props.describe, ref, t]);
                useEffect(() => {
                    // The reference can change under a still-pending read (the row config
                    // re-points `apiKeyEnv`), so this run passes a liveness check of its
                    // own: a response that arrives after the switch — or after this
                    // effect's cleanup — is dropped, and only the read for the reference
                    // now in force may paint the badge.
                    //
                    // A summary render shows no badge, so it issues no read: the detail page
                    // asks for one line of copy, and a credential round-trip per summary is
                    // work nobody sees.
                    if (props.view !== 'page')
                        return;
                    let cancelled = false;
                    void load(() => !cancelled);
                    return () => {
                        cancelled = true;
                    };
                }, [load, props.view]);
                /** One line of copy for a failed action, in the user's language where this page owns the words. */
                const failureCopy = useCallback((error, kind) => {
                    if (error instanceof CredentialsUnavailableError)
                        return t('unavailable');
                    const message = messageOf(error);
                    return kind === 'clear' ? `${t('clearFailed')}${message}` : message;
                }, [t]);
                /** Run one credential action, then re-read the state it changed. */
                const settle = useCallback(async (run, kind) => {
                    setPhase(kind === 'save' ? 'saving' : 'clearing');
                    setFailure('');
                    try {
                        await run();
                        if (!alive.current)
                            return;
                        // The action's outcome belongs to the reference it started on. If
                        // the row config re-pointed `apiKeyEnv` while the write was in
                        // flight, the page is now the new reference's, and its own read
                        // supplies both the badge and the notice — a "saved"/"cleared"
                        // notice for a reference that is no longer in force would mislead.
                        if (inForce.current !== ref)
                            return;
                        setDraft({ ref, text: '' });
                        setConfirming(false);
                        setPhase(kind === 'save' ? 'saved' : 'cleared');
                        // `load` closes over the reference this action started on, and the
                        // reference can move again while this read is pending: the guard
                        // keeps a superseded response off the badge, exactly like the
                        // effect's own run.
                        await load(() => inForce.current === ref);
                    }
                    catch (error) {
                        // A refusal whose reference is already gone is dropped along with
                        // the notice, deliberately: the page has moved on to another
                        // reference, whose own read reports that reference's state. Showing
                        // the old reference's failure on the new one would attribute it to
                        // the wrong credential. (The user acted on the reference the page
                        // showed at the time; the write itself did happen.)
                        if (!alive.current || inForce.current !== ref)
                            return;
                        setPhase('failed');
                        setFailure(failureCopy(error, kind));
                    }
                }, [failureCopy, load, ref]);
                // The row's detail page asks for `summary` only when the package ships no
                // description of its own; either way it is one line, not the form.
                if (props.view === 'summary')
                    return t('summary');
                // Degraded host: the web client no longer serves the primitives id
                // (defensive — verified present in every shipped core bundle through
                // dsh 0.2.1-rc.2). One readable line instead of a broken form.
                if (primitives === undefined) {
                    return h('p', { role: 'status', style: { margin: '0', fontSize: '13px', lineHeight: '20px' } }, t('uiUnavailable'));
                }
                // A staged key belongs to the reference it was typed under: if the row's
                // configuration re-points `apiKeyEnv` under a half-typed value, that text
                // must not be saved into the reference that is now in force.
                const staged = draft.ref === ref ? draft.text : '';
                const busy = phase === 'saving' || phase === 'clearing';
                // Save stays the primary action and Clear the secondary destructive one,
                // side by side — the same pairing the native status cards use. The native
                // SettingsForm owns its footer for Save alone, so the pair is composed
                // here from the same official Button: one row, native variants, and still
                // a single write path per action.
                const dirty = staged.trim().length > 0;
                const blocked = !dirty || busy;
                const status = credential.loaded
                    ? null
                    : h('p', {
                        key: 'status',
                        role: 'status',
                        style: {
                            margin: '0',
                            fontSize: '13px',
                            lineHeight: '20px',
                            // Native roles: an empty/reading line is tertiary, a refusal is
                            // the error colour (see the reference card's .dw7-empty /
                            // .dw7-error rules).
                            color: credential.error === ''
                                ? 'var(--dsw-alias-label-tertiary)'
                                : 'var(--dsw-alias-state-error-primary)',
                        },
                    }, credential.error === '' ? t('loading') : `${t('loadFailed')} ${credential.error}`);
                // A failed read says nothing about writability, so the field stays on
                // screen and the write reports its own refusal. Only the first read, with
                // nothing to contradict yet, withholds the form.
                const showForm = credential.loaded || credential.error !== '';
                // Built at the point of use, so the elements are created in the same
                // order they are painted (Save first, then Clear).
                const clearActions = () => (credential.configured && credential.writable
                    ? confirming
                        ? [
                            h(Button, {
                                key: 'confirm',
                                variant: 'primary',
                                size: 'sm',
                                disabled: busy,
                                onClick: () => {
                                    void settle(() => props.clearKey(ref), 'clear');
                                },
                            }, t('clearConfirm')),
                            h(Button, {
                                key: 'cancel',
                                variant: 'ghost',
                                size: 'sm',
                                disabled: busy,
                                onClick: () => {
                                    setConfirming(false);
                                },
                            }, t('clearCancel')),
                        ]
                        : [
                            h(Button, {
                                key: 'ask',
                                variant: 'ghost',
                                size: 'sm',
                                disabled: busy,
                                onClick: () => {
                                    setConfirming(true);
                                },
                            }, t('clear')),
                        ]
                    : []);
                // One line under the form: what just happened, in that order of precedence.
                // A success is only claimed while the badge actually reflects it
                // (`credential.loaded`), so a read that has not landed cannot sit under a
                // "saved" notice.
                const notice = noticeOf(credential.loaded, phase, failure, t);
                return h('div', { key: 'form', style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
                    status,
                    showForm
                        ? h(SettingsSecretField, {
                            key: 'key',
                            id: 'anysearch-api-key',
                            label: t('apiKey'),
                            hint: t('apiKeyHint', { ref }),
                            disabled: !credential.writable || busy,
                            text: staged,
                            configured: credential.configured,
                            stateLabel: credential.configured ? t('keySet') : t('keyUnset'),
                            onEdit: (text) => {
                                setDraft({ ref, text });
                                if (!busy) {
                                    setPhase('idle');
                                    setFailure('');
                                }
                            },
                        })
                        : null,
                    showForm && !credential.writable
                        ? h('p', {
                            key: 'readonly',
                            role: 'status',
                            style: { margin: '0', fontSize: '13px', lineHeight: '20px', color: 'var(--dsw-alias-label-tertiary)' },
                        }, t('readOnly'))
                        : null,
                    showForm
                        ? h('div', { key: 'actions', style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, [
                            h(Button, {
                                key: 'save',
                                variant: 'primary',
                                size: 'sm',
                                disabled: blocked,
                                onClick: () => {
                                    // An empty field is not a write: removing a key is the
                                    // Clear control's job, and writing '' would be a
                                    // destructive no-op nobody asked for.
                                    if (!dirty)
                                        return;
                                    void settle(() => props.setKey(ref, staged.trim()), 'save');
                                },
                            }, busy ? t('saving') : t('save')),
                            ...clearActions(),
                        ])
                        : null,
                    notice === ''
                        ? null
                        : h('p', {
                            key: 'notice',
                            role: 'status',
                            style: {
                                margin: '0',
                                fontSize: '13px',
                                lineHeight: '20px',
                                color: phase === 'failed'
                                    ? 'var(--dsw-alias-state-error-primary)'
                                    : 'var(--dsw-alias-label-tertiary)',
                            },
                        }, notice),
                ]);
            }
            /**
             * Required Client services. `remote` and `remote.credentials` must be
             * declared: reading `ctx.remote` without them throws, and this page has
             * nothing to show if that happens.
             */
            /**
             * The plugin page's provider card: which provider the native `web_search`
             * and `web_fetch` resolve, which layer names that selection, and the one
             * reversible switch. Reads ride the official settings mirror; the write
             * rides that form's own revision-fenced queue, so a concurrent edit is
             * refused and re-read instead of being silently overwritten.
             *
             * The native web entry is discovered from the mirror schema on every read,
             * so a deployment that never composes it renders nothing here — the card
             * stays invisible rather than guessing an entry id that may not exist.
             */
            function createWebSourceSection(forms, translate) {
                function WebSourceSection(props) {
                    const subject = props === undefined ? undefined : props.subject?.pkg;
                    const active = subject === PACKAGE ||
                        (typeof subject === 'object' && subject !== null && subject.name === PACKAGE);
                    function read() {
                        if (!active)
                            return ABSENT_SNAPSHOT;
                        const mirror = forms.describe();
                        // The mirror loads nothing until someone asks: the official forms do
                        // this inside `get()`, which cannot run before the entry is found.
                        // Without this line discovery would wait on a document nobody ever
                        // requests, and the card would report "unavailable" forever on a
                        // deployment that serves the form just fine.
                        void mirror.ensure();
                        const state = mirror.getSnapshot();
                        if (state.view === undefined) {
                            return state.status === 'error' ? ABSENT_SNAPSHOT : LOADING_SNAPSHOT;
                        }
                        const entry = webEntryOf(forms);
                        return entry === undefined ? ABSENT_SNAPSHOT : forms.get(entry).getSnapshot();
                    }
                    // Identity changes on purpose: discovery depends on the mirror, the
                    // values on the entry's form, and the entry can start being served
                    // later. React re-subscribes when this changes, which is exactly the
                    // refresh this card needs (both stores are cheap and local).
                    function subscribe(listener) {
                        const offMirror = forms.describe().subscribe(listener);
                        const entry = active ? webEntryOf(forms) : undefined;
                        if (entry === undefined)
                            return offMirror;
                        const offForm = forms.get(entry).subscribe(listener);
                        return () => {
                            offMirror();
                            offForm();
                        };
                    }
                    const snapshot = useSyncExternalStore(subscribe, read);
                    const [busy, setBusy] = useState(false);
                    const [failure, setFailure] = useState('');
                    // Another plugin's page: nothing to say, and nothing to leave behind.
                    if (!active)
                        return null;
                    if (snapshot.status === 'absent') {
                        // Our own page, but the Host serves no web-selection form. Say so:
                        // a silent empty render would make a missing seam indistinguishable
                        // from a card that was never built.
                        return h('p', {
                            role: 'status',
                            style: { margin: '0', fontSize: '13px', lineHeight: '20px', color: 'var(--dsw-alias-label-tertiary)' },
                        }, translate('webSourceUnavailable'));
                    }
                    if (snapshot.status === 'loading') {
                        return h('p', {
                            role: 'status',
                            style: { margin: '0', fontSize: '13px', lineHeight: '20px', color: 'var(--dsw-alias-label-tertiary)' },
                        }, translate('webSourceLoading'));
                    }
                    const source = webSourceOf(snapshot);
                    const fact = (label, value) => [
                        h('dt', { key: `${label}-label`, style: { color: 'var(--dsw-alias-label-tertiary)' } }, label),
                        h('dd', { key: `${label}-value`, style: { margin: '0', overflowWrap: 'anywhere' }, title: value }, value),
                    ];
                    const current = (value) => (value === '' ? translate('webSourceNone') : value);
                    const readOnly = snapshot.writable === false;
                    // The composed value (bundle layers) is what the profile override sits
                    // on. The native Web-search switch clears the override when a selection
                    // equals it, instead of storing a copy — so switching back to AnySearch
                    // removes the profile entry rather than pinning the same value twice.
                    const composed = {
                        searchProvider: fieldOf(snapshot.base, 'searchProvider'),
                        fetchProvider: fieldOf(snapshot.base, 'fetchProvider'),
                    };
                    const target = source.pointing
                        ? { searchProvider: OFFICIAL_PROVIDERS.searchProvider, fetchProvider: OFFICIAL_PROVIDERS.fetchProvider }
                        : { searchProvider: ANYSEARCH_PROVIDER, fetchProvider: ANYSEARCH_PROVIDER };
                    const opsFor = (next) => {
                        const ops = [];
                        for (const field of ['searchProvider', 'fetchProvider']) {
                            const value = next[field];
                            ops.push(value === composed[field] && composed[field] !== ''
                                ? { op: 'unset', path: [field] }
                                : { op: 'set', path: [field], value });
                        }
                        return ops;
                    };
                    async function switchProviders() {
                        const entry = webEntryOf(forms);
                        if (entry === undefined)
                            return;
                        setBusy(true);
                        setFailure('');
                        try {
                            // One atomic mutation: both fields apply under one revision fence,
                            // so search and fetch can never end up on different providers.
                            // A refusal means someone else wrote first; the form re-reads and
                            // the copy says the state may have moved.
                            const accepted = await forms.get(entry).mutate(opsFor(target));
                            if (!accepted)
                                setFailure(translate('webSourceRefused'));
                        }
                        catch {
                            // The page owns the wording, not the Host's raw error: a stack-ish
                            // sentence here is developer copy on a user surface.
                            setFailure(translate('webSourceRefused'));
                        }
                        finally {
                            setBusy(false);
                        }
                    }
                    // Native status-panel idiom (the voice-input card): the action lives at
                    // the top right of the title row, and the state that would replace it
                    // collapses to one note line at the bottom of the panel. The action is
                    // two-way: to AnySearch, or back to the native Search API pair.
                    const action = Button === undefined || readOnly
                        ? null
                        : h(Button, {
                            key: 'switch',
                            variant: 'outline',
                            size: 'sm',
                            disabled: busy,
                            onClick: () => {
                                void switchProviders();
                            },
                        }, busy
                            ? translate('webSourceBusy')
                            : source.pointing
                                ? translate('webSourceRestore')
                                : translate('webSourceSwitch'));
                    const note = readOnly ? translate('webSourceReadOnly') : translate('webSourceHint');
                    return h('section', { key: 'web-source', style: { display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '0' } }, [
                        h('div', {
                            key: 'head',
                            style: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: '0' },
                        }, [
                            h('h3', {
                                key: 'title',
                                style: {
                                    margin: '0',
                                    color: 'var(--dsw-alias-label-primary)',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    lineHeight: '20px',
                                },
                            }, translate('webSourceTitle')),
                            action === null
                                ? null
                                : h('div', { key: 'action', style: { marginLeft: 'auto', flex: 'none' } }, action),
                        ]),
                        h('div', {
                            key: 'panel',
                            style: {
                                boxSizing: 'border-box',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                                padding: '14px',
                                border: '.5px solid var(--dsw-alias-border-l1)',
                                borderRadius: '10px',
                                // Native panel surface: the 8% white overlay the reference
                                // status cards use (sampled as rgb(39,39,41) over the page
                                // background), not a solid layer token. On a filled surface
                                // the native role for body text is the secondary label, so
                                // the lead line and values inherit it instead of the primary
                                // colour the page uses.
                                background: 'var(--dsw-alias-interactive-bg-hover)',
                                color: 'var(--dsw-alias-label-secondary)',
                                fontSize: '13px',
                                minWidth: '0',
                            },
                        }, [
                            // Lead line first: the panel opens with what the reader needs to
                            // know, then the facts, then one note — the native order.
                            h('p', { key: 'verdict', style: { margin: '0', lineHeight: '20px', color: 'var(--dsw-alias-label-primary)' } }, source.pointing ? translate('webSourceAnysearch') : translate('webSourceOther')),
                            h('dl', {
                                key: 'facts',
                                style: { display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: '6px 10px', margin: '0' },
                            }, [
                                ...fact(translate('webSourceSearch'), current(source.search)),
                                ...fact(translate('webSourceFetch'), current(source.fetch)),
                                ...fact(translate('webSourceLayer'), source.overridden ? translate('webSourceProfile') : translate('webSourceBundle')),
                            ]),
                            h('p', {
                                key: 'note',
                                style: { margin: '0', color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '1.6' },
                            }, note),
                            failure === ''
                                ? null
                                : h('p', {
                                    key: 'failure',
                                    role: 'alert',
                                    style: { margin: '0', lineHeight: '20px', color: 'var(--dsw-alias-state-error-primary)' },
                                }, failure),
                        ]),
                    ]);
                }
                return WebSourceSection;
            }
            const inject = ['slots', 'locale', 'remote', 'remote.credentials', 'configForms'];
            /**
             * Register the row page and the copy it renders. Every credential action
             * takes the reference as an argument: the page resolves it from the row's
             * own configuration, which the owner hands over as a prop.
             */
            function apply(ctx) {
                const t = ctx.locale.bind(NS);
                ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${PACKAGE}: dictionaries`);
                const actions = {
                    t,
                    describe: (ref) => readCredential(ctx, ref),
                    setKey: async (ref, value) => {
                        unwrap(await credentialsSeam(ctx).set(ref, value), 'credentials.set');
                    },
                    clearKey: async (ref) => {
                        unwrap(await credentialsSeam(ctx).unset(ref), 'credentials.unset');
                    },
                };
                // `slots.inject` rather than a bare `register`: the Plugins page declares
                // `plugins.row.config` when it mounts, which can follow this activation.
                ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
                    name: 'plugins.row.config',
                    key: ROW_KEY,
                    locale: NS,
                    inject: () => actions,
                }, ApiKeyCard));
                // The provider card is an enhancement, not a prerequisite: a deployment
                // whose settings UI serves no shared configuration form (older DSH)
                // simply never registers it, and the row page above keeps working.
                const forms = ctx.configForms;
                if (forms !== undefined && typeof forms.get === 'function' && typeof forms.describe === 'function') {
                    const WebSourceSection = createWebSourceSection(forms, t);
                    ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({
                        name: 'plugins.detail.section',
                        id: `${PACKAGE}.web-source`,
                        order: 50,
                        locale: NS,
                    }, WebSourceSection));
                }
            }
            return { inject, apply };
        },
    });
})();
