import * as fs from 'fs';
import chalk from 'chalk';

fs.exists('credentials.json', (exists) => {
    if(exists){
        fs.exists('token.json', (exists) => {
            if(exists){
                fs.unlinkSync("token.json")
            }
        })
        console.log(chalk.green("Test passed"))
    } else {
        console.log(chalk.red("Test failed"))
        console.log(chalk.blue("-> credentials.json file not found"))
    }
})