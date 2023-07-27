import { ImportStatementParams, ParsedField } from './types';
import { DMMF } from '@prisma/generator-helper';
import EnumValue = DMMF.EnumValue;
import { isEnum } from './field-classifiers';

const PrismaScalarToTypeScript: Record<string, string> = {
  String: 'string',
  Boolean: 'boolean',
  Int: 'number',
  // [Working with BigInt](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields#working-with-bigint)
  BigInt: 'bigint',
  Float: 'number',
  // [Working with Decimal](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields#working-with-decimal)
  Decimal: 'Prisma.Decimal',
  DateTime: 'Date',
  // [working with JSON fields](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields)
  Json: 'Prisma.JsonValue',
  // [Working with Bytes](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields#working-with-bytes)
  Bytes: 'Buffer',
};

const knownPrismaScalarTypes = Object.keys(PrismaScalarToTypeScript);

export const scalarToTS = (scalar: string, useInputTypes = false): string => {
  if (!knownPrismaScalarTypes.includes(scalar)) {
    throw new Error(`Unrecognized scalar type: ${scalar}`);
  }

  // [Working with JSON fields](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields)
  // supports different types for input / output. `Prisma.InputJsonValue` extends `Prisma.JsonValue` with `undefined`
  if (useInputTypes && scalar === 'Json') {
    return 'Prisma.InputJsonValue';
  }

  return PrismaScalarToTypeScript[scalar];
};

export const echo = (input: string) => input;

export const when = (condition: any, thenTemplate: string, elseTemplate = '') =>
  condition ? thenTemplate : elseTemplate;

export const unless = (
  condition: any,
  thenTemplate: string,
  elseTemplate = '',
) => (!condition ? thenTemplate : elseTemplate);

export const each = <T = any>(
  arr: Array<T>,
  fn: (item: T) => string,
  joinWith = '',
) => arr.map(fn).join(joinWith);

export const importStatement = (input: ImportStatementParams) => {
  const { from, destruct = [], default: defaultExport } = input;
  const fragments = ['import'];
  if (defaultExport) {
    if (typeof defaultExport === 'string') {
      fragments.push(defaultExport);
    } else {
      fragments.push(`* as ${defaultExport['*']}`);
    }
  }
  if (destruct.length) {
    if (defaultExport) {
      fragments.push(',');
    }
    fragments.push(
      `{${destruct.flatMap((item) => {
        if (typeof item === 'string') return item;
        return Object.entries(item).map(([key, value]) => `${key} as ${value}`);
      })}}`,
    );
  }

  fragments.push(`from '${from}'`);

  return fragments.join(' ');
};

export const importStatements = (items: ImportStatementParams[]) =>
  `${each(items, importStatement, '\n')}`;

interface MakeHelpersParam {
  connectDtoPrefix: string;
  createDtoPrefix: string;
  updateDtoPrefix: string;
  dtoSuffix: string;
  entityPrefix: string;
  entitySuffix: string;
  enumPrefix: string;
  enumSuffix: string;
  transformClassNameCase?: (item: string) => string;
  transformFileNameCase?: (item: string) => string;
}
export const makeHelpers = ({
  connectDtoPrefix,
  createDtoPrefix,
  updateDtoPrefix,
  dtoSuffix,
  entityPrefix,
  entitySuffix,
  enumPrefix,
  enumSuffix,
  transformClassNameCase = echo,
  transformFileNameCase = echo,
}: MakeHelpersParam) => {
  const className = (name: string, prefix = '', suffix = '') =>
    `${prefix}${transformClassNameCase(name)}${suffix}`;
  const fileName = (
    name: string,
    prefix = '',
    suffix = '',
    withExtension = false,
  ) =>
    `${prefix}${transformFileNameCase(name)}${suffix}${when(
      withExtension,
      '.ts',
    )}`;

  const entityName = (name: string) =>
    className(name, entityPrefix, entitySuffix);
  const enumName = (name: string) => className(name, enumPrefix, enumSuffix);
  const connectDtoName = (name: string) =>
    className(name, connectDtoPrefix, dtoSuffix);
  const createDtoName = (name: string) =>
    className(name, createDtoPrefix, dtoSuffix);
  const updateDtoName = (name: string) =>
    className(name, updateDtoPrefix, dtoSuffix);

  const connectDtoFilename = (name: string, withExtension = false) =>
    fileName(name, 'connect-', '.dto', withExtension);

  const createDtoFilename = (name: string, withExtension = false) =>
    fileName(name, 'create-', '.dto', withExtension);

  const updateDtoFilename = (name: string, withExtension = false) =>
    fileName(name, 'update-', '.dto', withExtension);

  const entityFilename = (name: string, withExtension = false) =>
    fileName(name, undefined, '.entity', withExtension);

  const enumFilename = (name: string, withExtension = false) =>
    fileName(name, undefined, '.enum', withExtension);

  const fieldType = (field: ParsedField, toInputType = false) => {


// relationName:
    return `${
      field.kind === 'scalar'
        ? scalarToTS(field.type, toInputType)
        : field.kind === 'enum' || field.kind === 'relation-input'
          ? field.type
          : entityName(field.type)
    }${when(field.isList, '[]')}`
  };

  const apiProperty = (props?: {
    defaultValue?: string | { name: string; args: string[] };
    enumValues?: string[];
    type?: string;
    isArray?: boolean;
  }) => {
    if (!props) return '';
    if (!props.defaultValue && !props.enumValues && !props.type) return '';

    const newProps: { [key: string]: string | boolean } = {};

    if (!!props.type) newProps.type = props.type;

    if (!!props.isArray) newProps.isArray = props.isArray as boolean;

    if (!!props.enumValues) newProps.enum = JSON.stringify(props.enumValues);

    if (!!props.defaultValue) {
      if (typeof props.defaultValue === 'object') {
        if (props.defaultValue.name === 'now') {
          newProps.default = `'${new Date().toDateString()}'`;
        } else if (props.defaultValue.name === 'dbgenerated') {
          newProps.default = `"${props.defaultValue.args[0]}"`;
        }
      } else {
        newProps.default = `'${props.defaultValue}'`;
      }
    }

    const propKeys = Object.keys(newProps);
    const propValue = (key: string) => newProps[key];
    const propFormat = (key: string) => ` ${key}: ${propValue(key)}`;

    return `\n@ApiProperty({ ${propKeys.map(propFormat).join(',')} })\n`;
  };

  const fieldToDtoProp = (
    field: ParsedField,
    useInputTypes = false,
    forceOptional = false,
  ) => {

    console.log('fieldToDtoProp', field);
    return  `${when(
      field.kind === 'enum',
      `@ApiProperty({ enum: ${fieldType(field, useInputTypes)}})\n`,
    )}${field.name}${unless(
      field.isRequired && !forceOptional,
      '?',
    )}: ${fieldType(field, useInputTypes)};`;
  }

  const fieldsToDtoProps = (
    fields: ParsedField[],
    useInputTypes = false,
    forceOptional = false,
  ) =>
    `${each(
      fields,
      (field) => fieldToDtoProp(field, useInputTypes, forceOptional),
      '\n',
    )}`;

  const fieldToEntityProp = (field: ParsedField) =>
    `${when(
      field.hasOwnProperty('apiPropertyAnnotation'),
      apiProperty(field.apiPropertyAnnotation),
    )}
    ${field.name}
    ${unless(field.isRequired, '?')}: ${fieldType(field)} 
    ${when(field.isNullable, ' | null')}
    ${when(
      isEnum(field) && !!field.default,
      ` = ${fieldType(field)}.${field.default}`,
    )}
    ;`;

  const fieldsToEntityProps = (fields: ParsedField[]) =>
    `${each(fields, (field) => fieldToEntityProp(field), '\n')}`;

  const enumValueToProp = (value: EnumValue) => {
    const nameValue = !!value.dbName ? value.dbName : value.name;

    if (isNaN(Number(nameValue))) {
      return `${nameValue} = '${nameValue}'`;
    }

    return `${nameValue} = ${nameValue}`;
  };

  const enumValuesToEnumProps = (values: EnumValue[]) =>
    `${each(values, (value) => enumValueToProp(value), ',\n')}`;

  const apiExtraModels = (names: string[]) =>
    `@ApiExtraModels(${names.map(entityName)})`;

  return {
    config: {
      connectDtoPrefix,
      createDtoPrefix,
      updateDtoPrefix,
      dtoSuffix,
      entityPrefix,
      entitySuffix,
      enumPrefix,
      enumSuffix
    },
    apiExtraModels,
    entityName,
    enumName,
    connectDtoName,
    createDtoName,
    updateDtoName,
    connectDtoFilename,
    createDtoFilename,
    updateDtoFilename,
    entityFilename,
    enumFilename,
    each,
    echo,
    fieldsToDtoProps,
    fieldToDtoProp,
    fieldToEntityProp,
    fieldsToEntityProps,
    enumValuesToEnumProps,
    fieldType,
    for: each,
    if: when,
    importStatement,
    importStatements,
    transformClassNameCase,
    transformFileNameCase,
    unless,
    when,
  };
};

export type TemplateHelpers = ReturnType<typeof makeHelpers>;
