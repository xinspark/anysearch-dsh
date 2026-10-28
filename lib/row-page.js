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
        saveFailed: '操作未成功；没有写入任何东西。',
        clear: '清除密钥',
        clearConfirm: '确认清除',
        clearCancel: '取消',
        cleared: '已清除密钥；搜索回到匿名限额。',
        clearFailed: '清除失败：',
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
        saveFailed: 'The deployment refused it; nothing was written.',
        clear: 'Clear key',
        clearConfirm: 'Clear it',
        clearCancel: 'Cancel',
        cleared: 'Key cleared; searches are back to the anonymous limits.',
        clearFailed: 'Clear failed: ',
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
            const SettingsForm = primitives?.SettingsForm;
            const SettingsSecretField = primitives?.SettingsSecretField;
            const Button = primitives?.Button;
            // `require` hands back untyped modules; these four bindings are the only
            // React surface this page uses, typed so the component body stays checked.
            const useState = React.useState;
            const useEffect = React.useEffect;
            const useRef = React.useRef;
            const useCallback = React.useCallback;
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
                const labels = {
                    unavailable: credential.error === '' ? t('loading') : `${t('loadFailed')} ${credential.error}`,
                    readOnly: t('readOnly'),
                    saveFailed: t('saveFailed'),
                    save: t('save'),
                    saving: t('saving'),
                };
                const state = {
                    available: credential.loaded,
                    writable: credential.writable,
                    dirty: staged.trim().length > 0,
                    invalid: false,
                    saving: busy,
                    failed: phase === 'failed',
                };
                const controls = [
                    h(SettingsSecretField, {
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
                    }),
                ];
                // Clearing is destructive and immediate, so it takes a second click. It is
                // offered only where a write is possible at all: a key supplied by the
                // launching environment cannot be removed from here.
                if (credential.configured && credential.writable) {
                    controls.push(h('div', { key: 'clear', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, confirming
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
                        : h(Button, {
                            key: 'ask',
                            variant: 'outline',
                            size: 'sm',
                            disabled: busy,
                            onClick: () => {
                                setConfirming(true);
                            },
                        }, t('clear'))));
                }
                // One line under the form: what just happened, in that order of precedence.
                // A success is only claimed while the badge actually reflects it
                // (`credential.loaded`), so a read that has not landed cannot sit under a
                // "saved" notice.
                const notice = noticeOf(credential.loaded, phase, failure, t);
                return h('div', { style: { display: 'flex', flexDirection: 'column' } }, [
                    h(SettingsForm, {
                        key: 'form',
                        labels,
                        state,
                        onSave: () => {
                            // An empty field is not a write: the form gates Save on `dirty`,
                            // and removing a key is the Clear control's job. Writing '' into a
                            // reference the user never targeted would be a destructive no-op
                            // nobody asked for.
                            if (staged.trim().length === 0)
                                return;
                            void settle(() => props.setKey(ref, staged.trim()), 'save');
                        },
                        onDiscard: () => {
                            setDraft({ ref, text: '' });
                            setPhase('idle');
                            setFailure('');
                            setConfirming(false);
                        },
                    }, controls),
                    notice === ''
                        ? null
                        : h('p', {
                            key: 'notice',
                            role: 'status',
                            style: {
                                margin: '8px 0 0',
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
            const inject = ['slots', 'locale', 'remote', 'remote.credentials'];
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
            }
            return { inject, apply };
        },
    });
})();
