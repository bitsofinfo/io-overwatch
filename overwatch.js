'use strict';

var dateFormat = require('dateformat');
var Mustache = require('mustache');
var util = require('util');
var process = require('process');
var StatefulProcessCommandProxy = require('stateful-process-command-proxy');

/********************************
* Command line argument handling
*********************************/
var argv = require("yargs")
    .usage('Usage: $0 <command> [options]')
    .command('dir', 'Monitor a directory and react to changes')

    .demand('logging.file')
        .describe('logging.file','Full path to log file')

    .default('logging.level','debug')
        .describe('logging.level','Logging level')
        .choices('logging.level',['error','warn','info','verbose','info','debug','silly'])

    .demand('monitor.dir')
        .describe('monitor.dir','Directory to monitor')

    .default('monitor.stabilityThreshold',30000)
        .describe('monitor.stabilityThreshold',' Milliseconds for file sizes to remain constant before reacting.')

    .demand('evaluator.events')
        .array('evaluator.events')
        .describe('evaluator.events','Space separated list of relevant event types')
        .choices('evaluator.events',['add','addDir','change','unlink','unlinkDir'])

    .demand('evaluator.regex')
        .describe('evaluator.regex','Regex to apply to ioEvent.fullPath to trigger reactors')


    .demand('evaluator.reactors')
        .array('evaluator.reactors')
        .describe('evaluator.reactors','Ordered list of reactors')
        .choices('evaluator.reactors',['mkdir','copyFile','moveFile','copyAll','moveAll','extractFile','sqlInsert'])


    .default('reactor.mkdir.dir',null)
        .describe('reactor.mkdir.dir','Target dir create. Variables apply.')

    .default('reactor.copyAll.target',null)
        .describe('reactor.copyAll.target','Target dir to copy all files in monitored dir TO. Variables apply.')
    .default('reactor.moveAll.target',null)
        .describe('reactor.moveAll.target','Target dir to move all files in monitored dir TO. Variables apply.')

    .default('reactor.copyFile.target',null)
        .describe('reactor.copyFile.target','Target dir to copy evaluated file TO. Variables apply.')
    .default('reactor.moveFile.target',null)
        .describe('reactor.moveFile.target','Target dir to move evaluated file TO. Variables apply.')

    .default('reactor.extractFile.target',null)
        .describe('reactor.extractFile.target','Target dir to extract evaluated file TO. Variables apply.')

    .default('reactor.sqlInsert.table',null)
        .describe('reactor.sqlInsert.table','Table name for sql insert')
    .default('reactor.sqlInsert.columns',null)
        .array('reactor.sqlInsert.columns')
        .describe('reactor.sqlInsert.columns','Space separated list of target table columns.')
    .default('reactor.sqlInsert.values',null)
        .array('reactor.sqlInsert.values')
        .describe('reactor.sqlInsert.values','Space separated list of column values. Variables apply.')

    .default('reactor.shell.uid',process.getuid())
        .describe('reactor.shell.uid','uid to run shell commands as')
    .default('reactor.shell.gid',process.getgid())
        .describe('reactor.shell.gid','gid to run shell commands as')

    .demand('reactor.db.host')
        .describe('reactor.db.host','database host')
    .default('reactor.db.port',3306)
        .describe('reactor.db.port','database port')
    .demand('reactor.db.user')
        .describe('reactor.db.user','database user')
    .demand('reactor.db.pw')
        .describe('reactor.db.pw','database pw')
    .demand('reactor.db.name')
        .describe('reactor.db.name','database name')

    .epilogue("For certain options you can use the following variables:\n" +
              " {{ioEvent.context.timestamp}}\n" +
              " {{ioEvent.eventType}}\n" +
              " {{ioEvent.fullPath}}\n" +
              " {{ioEvent.parentPath}}\n" +
              " {{ioEvent.parentName}}\n" +
              " {{ioEvent.filename}}\n" +
              " {{ioEvent.uuid}}\n"
    )

    .argv;

console.log(util.inspect(argv,{depth:10}));

/********************************
* Logging/Errors
*********************************/
var winston = require('winston');
winston.add(require('winston-daily-rotate-file'),
            {
                filename: argv.logging.file,
            });
winston.level = argv.logging.level;

var logCallback = function(severity, origin, message) {
    if (origin != 'Pool') {
        winston.log(severity,origin + " - " + message);
    }
};

var errorCallback = function(message,error) {
    winston.log('error',message + " - " + util.inspect(error));
}

/********************************
* IoReactor
*********************************/
var IoReactorService = require("io-event-reactor");
var EvaluatorUtil = require('io-event-reactor/ioReactor').EvaluatorUtil;


/**
* generateSqlInsert - generates a new io-event-reactor-plugin-mysql plugin config
*
* @param reactorId id of the reactor to create
* @param sqlTemplates
* @param sqlGenerator
*/
function generateSqlInsert(reactorId, sqlTemplates, sqlGenerator) {
    return {  id: reactorId,
              plugin: "io-event-reactor-plugin-mysql",
              config: {
                    poolConfig : {
                       host     : argv.reactor.db.host,
                       host     : argv.reactor.db.port,
                       user     : argv.reactor.db.user,
                       password : argv.reactor.db.pw,
                       database : argv.reactor.db.name,
                       multipleStatements: true,
                       connectionLimit: 2
                    },
                    sqlTemplates: sqlTemplates,
                    sqlGenerator: sqlGenerator,
                }
            };
}

// we only maintain one proxy instance despite multiple shell command reactors
var statefulProcessCommandProxy = null;

// generate a shell proxy instance
function getStatefulProcessCommandProxyInstance() {

    if (statefulProcessCommandProxy != null) {
        return statefulProcessCommandProxy;
    } else {
        statefulProcessCommandProxy = new StatefulProcessCommandProxy({
                                            name: "statefulProcessCommandProxy",
                                            max: 2,
                                            min: 1,
                                            idleTimeoutMS: 300000,
                                            logFunction: logCallback,
                                            uid: argv.reactor.shell.uid,
                                            gid: argv.reactor.shell.gid,
                                            processCommand: '/bin/bash',
                                            processArgs:  ['-s'],
                                            processRetainMaxCmdHistory : 10,
                                            processCwd : './',
                                            validateFunction: function(processProxy) {
                                                return processProxy.isValid();
                                            }
                                        });
    }

    return statefulProcessCommandProxy;

}

/**
* generateShellExec - generates a new io-event-reactor-plugin-shell-exec plugin config
*
* @param reactorId id of the reactor to create
* @param cmdTemplates
* @param cmdGenerator
*/
function generateShellExec(reactorId, cmdTemplates, cmdGenerator) {
    return {  id: reactorId,
              plugin: "io-event-reactor-plugin-shell-exec",
              config: {
                  statefulProcessCommandProxy: {
                      instance: getStatefulProcessCommandProxyInstance()
                  },
                  commandTemplates: cmdTemplates,
                  commandGenerator: cmdGenerator
                }
            };
}

/**
* generateShellExec - generates a higher level file io reactor
*
* @param reactorType
* @param reactorId id of the reactor to create
* @param target target path
*/
function generateFileIoReactor(reactorType, reactorId, target) {
    var cmdTemplates = null;
    var cmdGenerator = null;

    if (reactorType == "copyFile") {
        cmdTemplates = [
            "yes | cp {{{ioEvent.fullPath}}} " + target
        ];

    } else if (reactorType == "moveFile"){
        cmdTemplates = [
            "mv {{{ioEvent.fullPath}}} " + target
        ];

    } else if (reactorType == "copyAll"){
        cmdTemplates = [
            "yes | cp -R {{{ioEvent.parentPath}}}/* " + target
        ];

    } else if (reactorType == "moveAll"){
        cmdTemplates = [
            "mv {{{ioEvent.parentPath}}}/* " + target
        ];

    } else if (reactorType == "mkdir"){
        cmdTemplates = [
            "mkdir -p " + target
        ];

    } else if (reactorType == "extractFileTo") {

        cmdGenerator = function(ioEvent) {

            var targetParsed = Mustache.render(target,{'ioEvent':ioEvent});

            var lcasefname = ioEvent.filename.toLowerCase();

            if (lcasefname.endsWith('.tgz') || lcasefname.endsWith('.gz')) {
                return ['tar -xvf ' + ioEvent.fullPath + ' -C ' + targetParsed];

            } else if (lcasefname.endsWith('.zip')) {
                return ['unzip ' + ioEvent.fullPath + ' -d ' + targetParsed];

            } else {
                throw new Error("extractFileTo Reactor only supports, tgz, gz, or zip files, you passed: " + lcasefname);
            }
        }
    } else {
        throw new Error("Unknown reactorType: " + reactorType);
    }

    return generateShellExec(reactorId,cmdTemplates,cmdGenerator);
}

/**
* generateSqlReactor - generates a higher level sql op reactor
*
* @param reactorType
* @param reactorId id of the reactor to create
* @param target target path
*/
function generateSqlReactor(reactorType, reactorId, table, columns, values) {
    var sqlTemplates = null;
    var sqlGenerator = null;

    if (reactorType == "sqlInsert") {
        sqlGenerator = function(ioEvent) {
            var insert = "INSERT INTO " + table + " ("+columns.toString()+") VALUES ("
            for (let val of values) {
                var parsed = Mustache.render(val,{'ioEvent':ioEvent});
                insert += ("'" + parsed + "',");
            }
            insert = insert.slice(0, -1);
            insert += ");";

            return [insert];
        }
    } else {
        throw new Error("Unknown reactorType: " + reactorType);
    }

    return generateSqlInsert(reactorId,sqlTemplates,sqlGenerator);
}


/**
* generateReactors()
*
* generate all requested reactors in order
*/
function generateReactors() {
    var reactors = [];

    // the first one is always genTimestamp
    reactors.push({ id: "genTimestamp",
      plugin: "./default_plugins/code/codeReactorPlugin",
      config: {
          codeFunction: function(ioEvent) {
              return new Promise(function(resolve,reject){
                  ioEvent.context.timestamp = dateFormat(new Date(), "yyyymmdd_hhMMssL");
                  resolve(true);
              });
          }
      }
  });

    // for every bound reactorId to our evaluator
    // generate the appropriate configuration
    var i = 0;
    for (let reactorType of argv.evaluator.reactors) {
        i++;

        // handle shell-exec based reactors
        if (reactorType == "copyFile" ||
            reactorType == "moveFile" ||
            reactorType == "copyAll"  ||
            reactorType == "moveAll"  ||
            reactorType == "mkdir"  ||
            reactorType == "extractFileTo") {

            reactors.push(generateFileIoReactor(reactorType, reactorType+i, argv.reactor[reactorType].target));

        } else if (reactorType == "sqlInsert") {
            reactors.push(generateSqlReactor(reactorType, reactorType+i,
                                              argv.reactor[reactorType].table,
                                              argv.reactor[reactorType].columns,
                                              argv.reactor[reactorType].values));

        } else {
            throw new Error("Cannot generateReactor() for unknown reactorType: " + reactorType);
        }
    }

    // collect all ids
    var ids = [];
    for (let r of reactors) {
        ids.push(r.id);
    }

    // replace with new ids
    argv.evaluator.reactors = ids;

    return reactors;

}


// generate reactors
var reactorConfs = generateReactors();

// IoReactorService configuration
var ioReactorServiceConfig = {

  logFunction: logCallback,
  errorCallback: errorCallback,

  ioReactors: [
        {
            id: "overwatch",

            monitor: {
                plugin: "io-event-reactor-plugin-chokidar",
                config: {
                    paths: [argv.monitor.dir],
                    options: {
                        alwaysStat: true,
                        awaitWriteFinish: {
                            stabilityThreshold: argv.monitor.stabilityThreshold,
                            pollInterval: 1000
                        },
                        ignoreInitial:true
                    }
                }
            },

            evaluators: [
                {
                    evaluator: EvaluatorUtil.regex(argv.evaluator.events,argv.evaluator.regex,'ig'),
                    reactors: argv.evaluator.reactors
                }
            ],

            reactors: reactorConfs,

        }

   ]
};


//console.log(util.inspect(ioReactorServiceConfig,{depth:10}));

// launch!
var reactor = new IoReactorService(ioReactorServiceConfig);
