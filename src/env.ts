import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
	PUBLIC_FAVICON_PROXY_BASE: { public: true, schema: input => input ?? "" },
});
