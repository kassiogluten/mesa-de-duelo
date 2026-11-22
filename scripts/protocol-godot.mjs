#!/usr/bin/env node
// Gera godot-table/net/protocol.gd a partir de src/forge/protocol.ts: os tipos de mensagem, de evento e de pergunta
// que a mesa no PC precisa conhecer. O tests/protocol-godot.test.mjs falha quando o arquivo gerado ficou para trás.
//   npm run protocol-godot      regrava godot-table/net/protocol.gd
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SRC = fileURLToPath(new URL('../src/forge/protocol.ts', import.meta.url));
export const OUT = fileURLToPath(new URL('../godot-table/net/protocol.gd', import.meta.url));

/** Os literais de string de um tipo (uniões, parênteses, interseções), na ordem em que aparecem. */
function literals(type, file, aliases) {
  if (!type) return [];
  if (ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)) return [type.literal.text];
  if (ts.isUnionTypeNode(type)) return type.types.flatMap(t => literals(t, file, aliases));
  if (ts.isParenthesizedTypeNode(type)) return literals(type.type, file, aliases);
  if (ts.isTypeReferenceNode(type) && aliases.has(type.typeName.getText(file))) return literals(aliases.get(type.typeName.getText(file)).type, file, aliases);
  return [];
}

/** Os valores do campo `field` em cada membro de uma união de objetos (ClientMessage, ServerMessage...), seguindo
 *  os tipos citados pelo nome (FState, ReplyMessage). */
function fieldValues(type, field, file, aliases, interfaces) {
  const next = t => fieldValues(t, field, file, aliases, interfaces);
  const fromMembers = members => {
    const member = members.find(m => ts.isPropertySignature(m) && m.name.getText(file) === field);
    return member ? literals(member.type, file, aliases) : [];
  };
  if (!type) return [];
  if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) return type.types.flatMap(next);
  if (ts.isParenthesizedTypeNode(type)) return next(type.type);
  if (ts.isTypeLiteralNode(type)) return fromMembers(type.members);
  if (ts.isTypeReferenceNode(type)) {
    const name = type.typeName.getText(file);
    if (aliases.has(name)) return next(aliases.get(name).type);
    if (interfaces.has(name)) return fromMembers(interfaces.get(name).members);
  }
  return [];
}

const unique = list => [...new Set(list)];

export function render() {
  const file = ts.createSourceFile(SRC, readFileSync(SRC, 'utf8'), ts.ScriptTarget.ES2022, true);
  const aliases = new Map();
  const interfaces = new Map();
  for (const st of file.statements) {
    if (ts.isTypeAliasDeclaration(st)) aliases.set(st.name.text, st);
    if (ts.isInterfaceDeclaration(st)) interfaces.set(st.name.text, st);
  }
  const prop = (iface, name) => {
    const member = interfaces.get(iface)?.members.find(m => ts.isPropertySignature(m) && m.name.getText(file) === name);
    if (!member) throw new Error(`${iface}.${name} não existe em protocol.ts`);
    return unique(literals(member.type, file, aliases));
  };
  const union = (alias, field) => unique(fieldValues(aliases.get(alias)?.type, field, file, aliases, interfaces));
  const groups = [
    ['CLIENT_MESSAGES', 'Mensagens da mesa para o servidor (ClientMessage).', union('ClientMessage', 'type')],
    ['SERVER_MESSAGES', 'Mensagens do servidor para a mesa (ServerMessage, inclusive as respostas).', union('ServerMessage', 'type')],
    ['REPLY_MESSAGES', 'Respostas casadas por requestId (ReplyMessage).', union('ReplyMessage', 'type')],
    ['EVENT_TYPES', 'Tipos de evento da partida (FEvent.type).', prop('FEvent', 'type')],
    ['QUESTION_KINDS', 'Tipos de pergunta (FQuestion.kind).', prop('FQuestion', 'kind')],
    ['QUESTION_PURPOSES', 'Finalidades de pergunta (FQuestion.purpose).', prop('FQuestion', 'purpose')],
  ];
  const out = [
    '# Constantes do protocolo do servidor, geradas de src/forge/protocol.ts por `npm run protocol-godot`; não edite à mão.',
    'extends RefCounted',
    '',
  ];
  for (const [name, about, values] of groups) {
    if (!values.length) throw new Error(`${name} saiu vazio: o formato de protocol.ts mudou?`);
    out.push(`## ${about}`, `const ${name}: PackedStringArray = [`, ...values.map(v => `\t"${v}",`), ']', '');
  }
  return out.join('\n').trimEnd() + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUT, render());
  console.log('godot-table/net/protocol.gd atualizado');
}
