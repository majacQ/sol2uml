#! /usr/bin/env node

import { convertUmlClasses2Dot } from './converterClasses2Dot'
import { parserUmlClasses } from './parserGeneral'
import { EtherscanParser } from './parserEtherscan'
import { classesConnectedToBaseContracts } from './filterClasses'

const debugControl = require('debug')
const debug = require('debug')('sol2uml')

import { Command, Option } from 'commander'
import { convertClasses2Slots } from './converterClasses2Slots'
import { convertSlots2Dot } from './converterSlots2Dot'
import { isAddress } from './utils/regEx'
import { writeOutputFiles, writeSolidity } from './writerFiles'
const program = new Command()

program
    .usage(
        `A set of visualisation tools for Solidity contracts.

The Solidity code can be pulled from verified source code on Blockchain explorers like Etherscan or from local Solidity files.

* class:    Generates a UML class diagram from Solidity source code. default
* storage:  Generates a diagram of a contracts storage slots.
* flatten:  Pulls verified source files from a Blockchain explorer into one, flat, local Solidity file.

sol2uml class --help
`
    )
    .addOption(
        new Option(
            '-d, --depthLimit <depth>',
            'number of sub folders that will be recursively searched for Solidity files.'
        ).default('-1', 'all')
    )
    .addOption(
        new Option('-f, --outputFormat <value>', 'output file format.')
            .choices(['svg', 'png', 'dot', 'all'])
            .default('svg')
    )
    .option('-o, --outputFileName <value>', 'output file name')
    .option(
        '-i, --ignoreFilesOrFolders <filesOrFolders>',
        'comma separated list of files or folders to ignore'
    )
    .addOption(
        new Option('-n, --network <network>', 'Ethereum network')
            .choices([
                'mainnet',
                'polygon',
                'bsc',
                'ropsten',
                'kovan',
                'rinkeby',
                'goerli',
            ])
            .default('mainnet')
    )
    .option('-k, --apiKey <key>', 'Etherscan, Polygonscan or BscScan API key')
    .option('-v, --verbose', 'run with debugging statements')

program
    .command('class', { isDefault: true })
    .description('Generates a UML class diagram from Solidity source code.')
    .usage(
        `<fileFolderAddress> [options]

Generates UML diagrams from Solidity source code.

If no file, folder or address is passes as the first argument, the working folder is used.
When a folder is used, all *.sol files are found in that folder and all sub folders.
A comma separated list of files and folders can also used. For example
    sol2uml contracts,node_modules/openzeppelin-solidity

If an Ethereum address with a 0x prefix is passed, the verified source code from Etherscan will be used. For example
    sol2uml 0x79fEbF6B9F76853EDBcBc913e6aAE8232cFB9De9`
    )
    .argument(
        '[fileFolderAddress]',
        'file name, base folder or contract address',
        process.cwd()
    )
    .option(
        '-b, --baseContractNames <value>',
        'only output contracts connected to these comma separated base contract names'
    )
    .option('-c, --clusterFolders', 'cluster contracts into source folders')
    .option('-a, --hideAttributes', 'hide class and interface attributes')
    .option(
        '-p, --hideOperators',
        'hide class and interface operators/functions'
    )
    .option('-e, --hideEnums', 'hide enum types')
    .option('-s, --hideStructs ', 'hide data structures')
    .option('-l, --hideLibraries ', 'hide libraries')
    .option('-t, --hideInterfaces ', 'hide interfaces')
    .option(
        '-r, --hideInternals',
        'hide private and internal attributes and operators'
    )
    .action(async (fileFolderAddress, options, command) => {
        try {
            const combinedOptions = {
                ...command.parent._optionValues,
                ...options,
            }

            const { umlClasses } = await parserUmlClasses(
                fileFolderAddress,
                combinedOptions
            )

            let filteredUmlClasses = umlClasses
            if (options.baseContractNames) {
                const baseContractNames = options.baseContractNames.split(',')
                filteredUmlClasses = classesConnectedToBaseContracts(
                    umlClasses,
                    baseContractNames
                )
            }

            const dotString = convertUmlClasses2Dot(
                filteredUmlClasses,
                combinedOptions.clusterFolders,
                combinedOptions
            )

            await writeOutputFiles(
                dotString,
                fileFolderAddress,
                combinedOptions.outputFormat,
                combinedOptions.outputFileName
            )

            debug(`Finished generating UML`)
        } catch (err) {
            console.error(`Failed to generate UML diagram ${err.message}`)
        }
    })

program
    .command('storage')
    .description('output a contracts storage slots')
    .argument(
        '<fileFolderAddress>',
        'file name, base folder or contract address'
    )
    .option(
        '-c, --contractName <value>',
        'Contract name in local Solidity files. Not needed when using an address as the first argument.'
    )
    // .option('-d, --data', 'gets the data in the storage slots')
    .action(async (fileFolderAddress, options, command) => {
        try {
            const combinedOptions = {
                ...command.parent._optionValues,
                ...options,
            }
            debug(`storage ${fileFolderAddress} ${combinedOptions}`)

            const { umlClasses, contractName } = await parserUmlClasses(
                fileFolderAddress,
                combinedOptions
            )

            const slots = convertClasses2Slots(
                combinedOptions.contractName || contractName,
                umlClasses
            )
            if (isAddress(fileFolderAddress)) {
                slots.address = fileFolderAddress
            }
            debug(slots)

            const dotString = convertSlots2Dot(slots)
            debug(dotString)

            await writeOutputFiles(
                dotString,
                fileFolderAddress,
                combinedOptions.outputFormat,
                combinedOptions.outputFileName
            )
        } catch (err) {
            console.error(`Failed to generate storage diagram ${err.message}`)
        }
    })

program
    .command('flatten')
    .description(
        'get all verified source code for a contract from the Blockchain explorer into one local file'
    )
    .argument('<contractAddress>', 'Contract address')
    .action(async (contractAddress, options, command) => {
        debug(`About to flatten ${contractAddress}`)

        const etherscanParser = new EtherscanParser(
            command.parent._optionValues.apiKey,
            options.network
        )

        const { solidityCode, contractName } =
            await etherscanParser.getSolidityCode(contractAddress)

        // Write Solidity to the contract address
        await writeSolidity(solidityCode, contractName)
    })

program.on('option:verbose', () => {
    debugControl.enable('sol2uml')
    debug('verbose on')
})

const main = async () => {
    await program.parseAsync(process.argv)
}
main()
