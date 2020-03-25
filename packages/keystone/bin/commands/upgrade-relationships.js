const path = require('path');
const chalk = require('chalk');
const { DEFAULT_ENTRY } = require('../../constants');
const { getEntryFileFullPath } = require('../utils');

const printArrow = ({ left, right }) => {
  if (right) {
    console.log(`  ${left.listKey}.${left.path} -> ${right.listKey}.${right.path}`);
  } else {
    console.log(`  ${left.listKey}.${left.path} -> ${left.refListKey}`);
  }
};

const strategySummary = ({
  one_one_to_many,
  one_many_to_many,
  two_one_to_one,
  two_one_to_many,
  two_many_to_many,
}) => {
  console.log(chalk.bold('One-sided: one to many'));
  one_one_to_many.forEach(({ left }) => {
    printArrow({ left });
    console.log('    * No action required');
  });

  console.log(chalk.bold('One-sided: mamny to many'));
  one_many_to_many.forEach(({ left, columnNames, tableName }) => {
    const { near, far } = columnNames[`${left.listKey}.${left.path}`];
    printArrow({ left });
    console.log(`    * Rename table ${left.listKey}_${left.path} to ${tableName}`);
    console.log(`    * Rename column ${left.listKey}_id to ${near}`);
    console.log(`    * Rename column ${left.refListKey}_id to ${far}`);
  });
  console.log(chalk.bold('Two-sided: one to one'));
  two_one_to_one.forEach(({ left, right }) => {
    printArrow({ left, right });
    console.log('    * FIXME');
  });
  console.log(chalk.bold('Two-sided: one to many'));
  two_one_to_many.forEach(({ left, right, tableName }) => {
    const dropper = left.listKey === tableName ? right : left;
    printArrow({ left, right });
    console.log(`    * Drop table ${dropper.listKey}_${dropper.path}`);
  });
  console.log(chalk.bold('Two-sided: many to many'));
  two_many_to_many.forEach(({ left, right, tableName, columnNames }) => {
    const { near, far } = columnNames[`${left.listKey}.${left.path}`];
    printArrow({ left, right });
    console.log(`    * Drop table ${right.listKey}_${right.path}`);
    console.log(`    * Rename table ${left.listKey}_${left.path} to ${tableName}`);
    console.log(`    * Rename column ${left.listKey}_id to ${near}`);
    console.log(`    * Rename column ${left.refListKey}_id to ${far}`);
  });
};

const simpleSummary = ({
  one_one_to_many,
  one_many_to_many,
  two_one_to_one,
  two_one_to_many,
  two_many_to_many,
}) => {
  console.log(chalk.bold('One-sided: one to many'));
  one_one_to_many.forEach(({ left }) => {
    printArrow({ left });
  });

  console.log(chalk.bold('One-sided: mamny to many'));
  one_many_to_many.forEach(({ left }) => {
    printArrow({ left });
  });
  console.log(chalk.bold('Two-sided: one to one'));
  two_one_to_one.forEach(({ left, right }) => {
    printArrow({ left, right });
  });
  console.log(chalk.bold('Two-sided: one to many'));
  two_one_to_many.forEach(({ left, right }) => {
    printArrow({ left, right });
  });
  console.log(chalk.bold('Two-sided: many to many'));
  two_many_to_many.forEach(({ left, right }) => {
    printArrow({ left, right });
  });
};

const upgradeRelationships = async (args, entryFile, spinner) => {
  // Allow the spinner time to flush its output to the console.
  await new Promise(resolve => setTimeout(resolve, 100));
  const { keystone } = require(path.resolve(entryFile));

  const rels = keystone._consolidateRelationships();

  const one_one_to_many = rels.filter(({ right, cardinality }) => !right && cardinality !== 'N:N');
  const one_many_to_many = rels.filter(({ right, cardinality }) => !right && cardinality === 'N:N');

  const two_one_to_one = rels.filter(({ right, cardinality }) => right && cardinality === '1:1');
  const two_one_to_many = rels.filter(
    ({ right, cardinality }) => right && (cardinality === '1:N' || cardinality === 'N:1')
  );
  const two_many_to_many = rels.filter(({ right, cardinality }) => right && cardinality === 'N:N');

  strategySummary({
    one_one_to_many,
    one_many_to_many,
    two_one_to_one,
    two_one_to_many,
    two_many_to_many,
  });
  process.exit(0);
};

module.exports = {
  // prettier-ignore
  spec: {
    '--entry':      String,
  },
  help: ({ exeName }) => `
    Usage
      $ ${exeName} upgrade-relationships

    Options
      --entry       Entry file exporting keystone instance [${DEFAULT_ENTRY}]
  `,
  exec: async (args, { exeName, _cwd = process.cwd() } = {}, spinner) => {
    spinner.text = 'Validating project entry file';
    const entryFile = await getEntryFileFullPath(args, { exeName, _cwd });
    spinner.start(' ');
    return upgradeRelationships(args, entryFile, spinner);
  },
};
