This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/api-routes/introduction) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/api-routes/introduction) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

# Candy Model Prediction App

## RecordSet Format Guide

This project uses a specific JSON format called "RecordSet" when interacting with the API. This format is required for:

- Uploading datasets
- Registering batch orders
- Making predictions

### RecordSet Format Example

```json
{
  "RecordSet": [
    {
      "FECHA": "17.03.2025",
      "NOMBRE_SUCURSAL_ORIGEN": "CENTRO",
      "ARTICULO_ID": 49687,
      "NOMBRE_ARTICULO": "PALETA VAQUERO 20PZS",
      "CANTIDAD": 30
    },
    {
      "FECHA": "17.03.2025",
      "NOMBRE_SUCURSAL_ORIGEN": "CENTRO",
      "ARTICULO_ID": 246774,
      "NOMBRE_ARTICULO": "CHICLE MINI BU DLR 100P/3.7G",
      "CANTIDAD": 28
    }
  ]
}
```

### Required Fields

Each record in the RecordSet must contain the following fields:

- `FECHA` - Date in DD.MM.YYYY format
- `NOMBRE_SUCURSAL_ORIGEN` - Branch name
- `ARTICULO_ID` - Product ID
- `NOMBRE_ARTICULO` - Product name
- `CANTIDAD` - Quantity

### API Usage Examples

#### 1. Registering Batch Orders

```javascript
const data = {
  RecordSet: [
    {
      EXP_REQ_ID: 17007,
      FECHA: "17.03.2025",
      ORIGEN: 7,
      NOMBRE_SUCURSAL_ORIGEN: "CENTRO",
      ARTICULO_ID: 49687,
      NOMBRE_ARTICULO: "PALETA VAQUERO 20PZS",
      CANTIDAD: 30
    }
  ]
};

await axios.post('/api/proxy?endpoint=registrar_pedidos_batch', data);
```

#### 2. Uploading a Dataset

When uploading a dataset through the Admin Panel, ensure your JSON file follows the RecordSet format.

#### 3. Making Predictions

The prediction API automatically handles the RecordSet format internally.

## License

This project is distributed under two license types:

1. **Commercial License** - For business use, requiring a valid license key
2. **Academic License** - Free for educational and research purposes only

Contact support for licensing information.
