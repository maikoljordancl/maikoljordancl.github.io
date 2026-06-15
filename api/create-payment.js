export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { items, comprador } = req.body;

  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        items: items.map(item => ({
          title: `${item.nombre} - Talla ${item.talla}`,
          quantity: 1,
          unit_price: item.precio,
          currency_id: 'CLP'
        })),
        shipments: { cost: 5000, mode: 'not_specified' },
        payer: {
          name: comprador.nombre,
          phone: { number: comprador.whatsapp }
        },
        external_reference: JSON.stringify(comprador),
        back_urls: {
          success: 'https://maikoljordan.cl/gracias.html',
          failure: 'https://maikoljordan.cl',
          pending: 'https://maikoljordan.cl/gracias.html'
        },
        auto_return: 'approved',
        statement_descriptor: 'MAIKOL JORDAN'
      })
    });

    const data = await response.json();
    return res.status(200).json({ init_point: data.init_point });
  } catch (error) {
    return res.status(500).json({ error: 'Error al crear el pago' });
  }
}
