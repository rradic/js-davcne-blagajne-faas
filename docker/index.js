const express = require("express");
const axios = require("axios");
const {v4} = require('uuid')
const crypto = require('crypto')
const { buildSchema, GraphQLScalarType, Kind } = require('graphql');
const { createHandler } = require('graphql-http/lib/use/express');


const app = express();
app.use(express.json());
const cors = require("cors");
app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));


app.post("/api/invoice", async (req, res) =>{
    const { invoiceNumber, amount, businessUnitId, deviceId, token, taxNumber, numberingStructure } = req.body
    const result = await sendInvoiceToFurs(
        invoiceNumber, amount, businessUnitId, deviceId, token, taxNumber, numberingStructure
    )
    res.status(200).send(result)
});
app.get("/api/invoice", async (req, res) =>{
    const { zoi, token } = req.query
    const result = await checkInvoiceFromFurs(zoi, token)
    res.status(200).send(result)
});

const PORT = process.env.PORT || 3000;

// taxNumber and numberingStructure are hardcoded
async function sendInvoiceToFurs (invoiceNumber, amount, businessUnitId, deviceId, token, taxNumber, numberingStructure) {
    const uuid = v4()
    const date = "2023-03-20T15:03:05Z"
    const taxRate = 22.00
    const invoice = {
        InvoiceRequest: {
            Header: {
                MessageID: uuid,
                DateTime: date,
            },
            Invoice: {
                TaxNumber: taxNumber,
                IssueDateTime: date,
                NumberingStructure: numberingStructure,
                InvoiceIdentifier: {
                    BusinessPremiseID: businessUnitId,
                    ElectronicDeviceID: deviceId,
                    InvoiceNumber: invoiceNumber,
                },
                InvoiceAmount: amount,
                PaymentAmount: amount,
                TaxesPerSeller: [{
                    VAT: [{
                        TaxRate: parseFloat(taxRate.toFixed(2)),
                        TaxableAmount: parseFloat((amount/1.22).toFixed(2)),
                        TaxAmount: parseFloat((amount - (amount/1.22)).toFixed(2)),
                    }]
                }],
                OperatorTaxNumber: taxNumber,
                ProtectedID: crypto.createHash('md5').update(uuid).digest('hex').substring(0, 32)
            }
        }
    }

        const response = await axios.post(
            "http://981.ablak.arnes.si:2025/invoice",
            JSON.stringify(invoice),
            { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'}}
        )

    const zoi = response.data.ZOI
    const messageID = response.data.response.InvoiceResponse.Header.MessageID
    const dateTime = response.data.response.InvoiceResponse.Header.DateTime
    const uniqueInvoiceID = response.data.response.InvoiceResponse.UniqueInvoiceID
    const qr = response.data.QR

    return { zoi, qr, messageID, dateTime, uniqueInvoiceID }
}


async function checkInvoiceFromFurs(zoi, authToken) {
    const response = await axios.get(
        `http://981.ablak.arnes.si:2025/check-invoice?zoi=${zoi}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
    )

    const tax = response.data.TAX
    const amount = response.data.AMOUNT
    const date = response.data.DATETIME
    const token = response.data.CONTENT.token

    return { tax, amount, date, token }
}

/*async function checkBusinessId(email, result) {
    // TODO kada bude placanje za krajnje korisnike
}


async function registerBusinessId(email, result) {
    // TODO kada bude placanje za krajnje korisnike
}*/

const schema = buildSchema(`
    scalar Date

    type Invoice {
        zoi: String!
        tax: String!
        amount: String!
        date: Date!
        token: String!
    }

    type Query {
        getInvoice(zoi: String!, token: String!): Invoice
        getInvoicesByZois(zois: [String!]!, token: String!): [Invoice]
    }
`);

const dateScalar = new GraphQLScalarType({
    name: 'Date',
    description: 'Custom scalar for Date',
    parseValue(value) {
        return new Date(value);
    },
    serialize(value) {
        return value.toISOString();
    },
    parseLiteral(ast) {
        if (ast.kind === Kind.STRING) return new Date(ast.value);
        return null;
    },
});
const root = {
    Date: dateScalar,

    async getInvoice({ zoi, token }) {
        const data = await checkInvoiceFromFurs(zoi, token);
        return {
            zoi: zoi,
            tax: data.tax,
            amount: data.amount,
            date: data.date,
            token: data.token,
        };
    },

    async getInvoicesByZois({ zois, token }) {
        let response = []
        for (const zoi of zois) {
            const data = await checkInvoiceFromFurs(zoi, token);
            response.push({
                zoi: zoi,
                tax: data.tax,
                amount: data.amount,
                date: data.date,
                token: data.token,
            });
        }
        return response;
    }
};

app.all('/graphql', createHandler({
    schema: schema,
    rootValue: root,
}));
app.get('/graphql-playground', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>GraphQL Playground</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/graphql-playground-react@1.7.28/build/static/css/index.css" />
        </head>
        <body>
            <div id="root"></div>
            <script src="https://cdn.jsdelivr.net/npm/graphql-playground-react@1.7.28/build/static/js/middleware.js"></script>
            <script>
                GraphQLPlayground.init(document.getElementById('root'), {
                    endpoint: '/graphql'
                })
            </script>
        </body>
        </html>
    `);
});
app.listen(PORT, () => console.log(`Zabojnik posluša na portu ${PORT}`));