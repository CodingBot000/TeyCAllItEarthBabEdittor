/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: false,

	turbopack: {
		root: __dirname,
		rules: {
			"*.{fx}": {
				loaders: ["raw-loader"],
				as: "*.js",
			},
		},
	},
};

module.exports = nextConfig;
