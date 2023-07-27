import path from 'node:path';
import slash from 'slash';
import {
  DEFAULT_VALUE,
  DTO_ENTITY_HIDDEN,
  DTO_RELATION_REQUIRED,
} from '../annotations';
import {
  getAnnotationValue,
  isAnnotatedWith,
  isEnum,
  isRelation,
  isRequired,
} from '../field-classifiers';
import {
  getRelationScalars,
  getRelativePath,
  makeImportsFromPrismaClient,
  mapDMMFToParsedField,
  zipImportStatementParams,
} from '../helpers';

import type { DMMF } from '@prisma/generator-helper';
import type {
  Model,
  EntityParams,
  ImportStatementParams,
  ParsedField,
  Enum,
} from '../types';
import type { TemplateHelpers } from '../template-helpers';

interface ComputeEntityParamsParam {
  model: Model;
  allModels: Model[];
  allEnums: Enum[];
  templateHelpers: TemplateHelpers;
}
export const computeEntityParams = ({
  model,
  allModels,
  allEnums,
  templateHelpers,
}: ComputeEntityParamsParam): EntityParams => {
  const imports: ImportStatementParams[] = [];
  const apiExtraModels: string[] = [];

  const relationScalarFields = getRelationScalars(model.fields);
  const relationScalarFieldNames = Object.keys(relationScalarFields);

  let fieldHasApiProperty = false;

  const fields = model.fields.reduce((result, field) => {
    const { name } = field;
    const apiPropertyAnnotation: { [key: string]: string } = {};

    const overrides: Partial<DMMF.Field> = {
      isRequired: true,
      isNullable: !field.isRequired,
      apiPropertyAnnotation,
    };

    if (isAnnotatedWith(field, DTO_ENTITY_HIDDEN)) return result;

    const defaultValue =
      getAnnotationValue(field, DEFAULT_VALUE) || field.default;

    if (!!defaultValue) {
      fieldHasApiProperty = true;
      overrides.apiPropertyAnnotation.defaultValue = defaultValue;
      overrides.apiPropertyAnnotation.isArray = field.isList;
    }

    // relation fields are never required in an entity.
    // they can however be `selected` and thus might optionally be present in the
    // response from PrismaClient
    if (isRelation(field)) {
      overrides.isRequired = false;
      overrides.isNullable = field.isList
        ? false
        : field.isRequired
        ? false
        : !isAnnotatedWith(field, DTO_RELATION_REQUIRED);

      // don't try to import the class we're preparing params for
      if (field.type !== model.name) {
        const modelToImportFrom = allModels.find(
          ({ name }) => name === field.type,
        );

        if (!modelToImportFrom)
          throw new Error(
            `related model '${field.type}' for '${model.name}.${field.name}' not found`,
          );

        const importName = templateHelpers.entityName(field.type);
        const importFrom = slash(
          `${getRelativePath(
            model.output.entity,
            modelToImportFrom.output.entity,
          )}${path.sep}${templateHelpers.entityFilename(field.type)}`,
        );

        overrides.apiPropertyAnnotation.type = field.type;
        overrides.apiPropertyAnnotation.isArray = field.isList;
        fieldHasApiProperty = true;

        // don't double-import the same thing
        // TODO should check for match on any import name ( - no matter where from)
        if (
          !imports.some(
            (item) =>
              Array.isArray(item.destruct) &&
              item.destruct.includes(importName) &&
              item.from === importFrom,
          )
        ) {
          imports.push({
            destruct: [importName],
            from: importFrom,
          });
        }
      }
    }

    if (relationScalarFieldNames.includes(name)) {
      const { [name]: relationNames } = relationScalarFields;
      const isAnyRelationRequired = relationNames.some((relationFieldName) => {
        const relationField = model.fields.find(
          (anyField) => anyField.name === relationFieldName,
        );
        if (!relationField) return false;

        return (
          isRequired(relationField) ||
          isAnnotatedWith(relationField, DTO_RELATION_REQUIRED)
        );
      });

      overrides.isRequired = true;
      overrides.isNullable = !isAnyRelationRequired;
    }

    if (isEnum(field) && field.type !== model.name) {
      const enumToImportFrom = allEnums.find(({ name }) => name === field.type);

      if (!enumToImportFrom)
        throw new Error(
          `related enum '${field.type}' for '${model.name}.${field.name}' not found`,
        );

      let enumValues: string[] | undefined = enumToImportFrom.values.map(
        (enumValue) => enumValue.dbName || enumValue.name,
      );

      if (!enumValues.length) enumValues = undefined;

      overrides.apiPropertyAnnotation.enumValues = enumValues;
      overrides.apiPropertyAnnotation.type =
        enumToImportFrom.dbName || enumToImportFrom.name;
      fieldHasApiProperty = true;

      const importName = templateHelpers.enumName(field.type);
      const importFrom = slash(
        `${getRelativePath(model.output.entity, enumToImportFrom.output.enum)}${
          path.sep
        }${templateHelpers.enumFilename(field.type)}`,
      );

      if (
        !imports.some(
          (item) =>
            Array.isArray(item.destruct) &&
            item.destruct.includes(importName) &&
            item.from === importFrom,
        )
      ) {
        imports.push({
          destruct: [importName],
          from: importFrom,
        });
      }
    }

    if (!fieldHasApiProperty) delete overrides.apiPropertyAnnotation;

    return [...result, mapDMMFToParsedField(field, overrides)];
  }, [] as ParsedField[]);

  if (apiExtraModels.length || fieldHasApiProperty) {
    const destruct = [];
    if (apiExtraModels.length) destruct.push('ApiExtraModels');
    if (fieldHasApiProperty) destruct.push('ApiProperty');
    imports.unshift({ from: '@nestjs/swagger', destruct });
  }

  const importPrismaClient = makeImportsFromPrismaClient(fields);
  if (importPrismaClient) imports.unshift(importPrismaClient);

  return {
    model,
    fields,
    imports: zipImportStatementParams(imports),
    apiExtraModels,
  };
};
