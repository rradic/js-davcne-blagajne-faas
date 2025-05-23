const functions = require("firebase-functions")
const axios = require("axios");
const {v4} = require('uuid')
const crypto = require('crypto')

exports.sendInvoice = functions.https.onRequest(async (req, res) =>{
    const { invoiceNumber, amount, businessUnitId, deviceId, token, taxNumber, numberingStructure } = req.body
    const result = await sendInvoiceToFurs(
        invoiceNumber, amount, businessUnitId, deviceId, token, taxNumber, numberingStructure
    )
    res.status(200).send(result)
})

exports.checkInvoice = functions.https.onRequest(async (req, res) =>{
    const { zoi, token } = req.body
    const result = await checkInvoiceFromFurs(zoi, token)
    res.status(200).send(result)
})

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