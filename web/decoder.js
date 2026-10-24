/* Read-only, unconfirmed SYM decoder. Original payload always stays intact. */
(function (root) {
  function decode(frame, schema) {
    try {
      const id = Number.parseInt(frame.id, 16), hex = frame.data;
      if (typeof frame.extended !== 'boolean' || typeof frame.rtr !== 'boolean' || !Number.isInteger(frame.dlc) || frame.dlc < 0 || frame.dlc > 8) throw Error('Флаги / DLC');
      if (!Number.isInteger(id) || id < 0 || id > (frame.extended ? 0x1fffffff : 0x7ff)) throw Error('ID / extended');
      if (typeof hex !== 'string' || !/^(?:[0-9a-fA-F]{2})*$/.test(hex) || hex.length !== (frame.rtr ? 0 : frame.dlc * 2)) throw Error('Длина DATA');
      if (frame.rtr) return {status:'rtr'};
      const msg = schema.messages.find(m => Number.parseInt(m.id, 16) === id);
      if (!msg) return {status:'unknown'};
      if (!frame.extended || frame.dlc !== msg.picture_bytes) throw Error('Длина / флаги SYM');
      const data = hex.match(/../g)?.map(x => parseInt(x, 16)) || [], fields = {};
      for (const s of msg.signals) {
        let raw = s.bits_lsb0.reduce((v, bit, i) => v + ((data[Math.floor(bit / 8)] >> (bit % 8)) & 1) * 2 ** i, 0);
        if (s.type === 'signed' && raw >= 2 ** (s.bit_length - 1)) raw -= 2 ** s.bit_length;
        fields[s.name] = {raw, value: raw * s.factor + s.offset, unit: s.unit};
      }
      return {status:'decoded_unconfirmed',message:msg.name,fields};
    } catch (error) { return {status:'invalid',reason:error.message}; }
  }
  root.BafangDecoder = {decode};
  if (typeof module !== 'undefined') module.exports = {decode};
})(typeof globalThis !== 'undefined' ? globalThis : this);
