/**
 * Extends app.json. EXPO_BASE_URL lets the web build be served from a
 * subpath (e.g. GitHub Pages serves at /<repo-name>/). Leave it unset for
 * root-hosted deploys like Vercel or Netlify.
 */
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl: process.env.EXPO_BASE_URL || undefined,
  },
});
