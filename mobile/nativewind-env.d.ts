/// <reference types="nativewind/types" />

// Metro compiles global.css (Tailwind) via NativeWind; TypeScript only needs to know it exists.
declare module '*.css';
