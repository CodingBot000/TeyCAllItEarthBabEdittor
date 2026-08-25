/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: false,
	allowedDevOrigins: ['127.0.0.1'],

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
