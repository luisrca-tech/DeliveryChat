import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	integrations: [react()],
	vite: {
		// @ts-expect-error - Vite plugin type mismatch between Astro and Tailwind CSS
		plugins: [tailwindcss()],
	},
});
