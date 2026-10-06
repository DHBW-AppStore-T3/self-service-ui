import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

export default (_env, argv) => {
    const development = argv.mode === 'development';
    const config = {
        dynamicZonesBaseUrl: process.env.DYNAMIC_ZONE_BASE_URL || '',
        cloudResourcesBaseUrl: process.env.CLOUD_RESOURCES_BASE_URL || '',
        cloudResourcesMcpUrl: process.env.CLOUD_RESOURCES_MCP_URL || '',
        dynamicZonesMcpUrl: process.env.DYNAMIC_ZONE_MCP_URL || '',
        appStoreBaseUrl: process.env.APP_STORE_BASE_URL || '/api/app-store',
        appStoreFrontendUrl: process.env.APP_STORE_FRONTEND_URL || (development ? 'http://localhost:5173' : ''),
        appStoreEnabled: process.env.APP_STORE_ENABLED !== 'false',
        acmeServer: process.env.ACME_SERVER || 'https://certificates.dhbw.cloud',
        dummyAuth: development && process.env.DUMMY_AUTH === 'true',
        oidc: {
            client_id: process.env.OIDC_CLIENT_ID || '',
            issuer_url: process.env.OIDC_ISSUER_URL || '',
            end_session_url: process.env.OIDC_END_SESSION_URL || '',
        },
    };
    const proxies = [
        ['/api/app-store', process.env.APP_STORE_BFF_UPSTREAM || process.env.APP_STORE_UPSTREAM || 'http://localhost:8000'],
        ['/api/projects', process.env.CLOUD_RESOURCES_UPSTREAM],
        ['/api/dyndns', process.env.DYN_ZONES_UPSTREAM],
        ['/oauth2', process.env.AUTH_PROXY_UPSTREAM],
    ].filter(([, target]) => target).map(([prefix, target]) => ({
        context: [prefix], target, changeOrigin: true,
        ...(prefix === '/oauth2' || (prefix === '/api/app-store' && process.env.APP_STORE_BFF_UPSTREAM) ? {} : { pathRewrite: { [`^${prefix}`]: '' } }),
    }));
    return {
        entry: './web/index.jsx',
        output: { path: path.join(root, 'dist'), filename: 'assets/[name].[contenthash].js', publicPath: '/', clean: true },
        resolve: { roots: [path.join(root, 'web')], extensions: ['.js', '.jsx'] },
        module: { rules: [
            { test: /\.jsx?$/, exclude: /node_modules/, use: { loader: 'babel-loader', options: { presets: [['@babel/preset-react', { runtime: 'automatic' }]] } } },
            { test: /\.css$/, use: [development ? 'style-loader' : MiniCssExtractPlugin.loader, 'css-loader'] },
            { test: /\.(svg|png|webp|ico)$/, type: 'asset/resource', generator: { filename: 'assets/[name].[contenthash][ext]' } },
        ] },
        plugins: [
            new webpack.DefinePlugin({ __APP_VERSION__: JSON.stringify(pkg.version), __DEV__: JSON.stringify(development) }),
            new HtmlWebpackPlugin({ template: './web/index.html', scriptLoading: 'defer' }),
            new CopyWebpackPlugin({ patterns: [{ from: 'web/img', to: 'img' }] }),
            new MiniCssExtractPlugin({ filename: 'assets/[name].[contenthash].css' }),
            { apply(compiler) {
                compiler.hooks.thisCompilation.tap('RuntimeConfig', compilation => {
                    compilation.hooks.processAssets.tap({ name: 'RuntimeConfig', stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL }, () => {
                        compilation.emitAsset('config.js', new webpack.sources.RawSource(`window.appconfig = ${JSON.stringify(config)};\n`));
                    });
                });
            } },
        ],
        optimization: { splitChunks: { chunks: 'all' }, runtimeChunk: 'single' },
        devtool: development ? 'eval-source-map' : false,
        devServer: { host: '0.0.0.0', port: 8084, allowedHosts: ['localhost', 'host.docker.internal'], historyApiFallback: true, proxy: proxies, static: false },
        watchOptions: { poll: 300, ignored: /node_modules/ },
        stats: 'errors-warnings',
    };
};
