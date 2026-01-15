export interface Tool {
	name: string;
	description: string;
	path: string;
	icon: string;
	status: "ready" | "coming-soon";
}
