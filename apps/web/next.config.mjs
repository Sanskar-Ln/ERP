/** @type {import('next').NextConfig} */
const nextConfig = {
  // @erp/shared ships compiled CJS; transpilePackages keeps HMR working
  // when the package is rebuilt during development.
  transpilePackages: ['@erp/shared'],
};

export default nextConfig;
