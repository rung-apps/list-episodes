const { create } = require('rung-sdk');
const { String: Text, Natural } = require('rung-sdk/dist/types');
const Bluebird = require('bluebird');
const agent = require('superagent');
const promisifyAgent = require('superagent-promise');
const { map, mergeAll, filter, propSatisfies, lte, gte, join, isNil, allPass } = require('ramda');
const moment = require('moment');

const request = promisifyAgent(agent, Bluebird);

function createAlert(episode, showName, { average }, network) {
    const { id, name, season, number, airdate, airtime, image, summary, url } = episode;
    const channel = `${network.name} - ${network.country.code}`;

    return {
        [id]: {
            title: `${showName} S${season}E${number} - ${name} (${moment(airdate).format('DD/MM/YYYY')})`,
            comment: `
                ### ${name} às ${airtime} na ${channel}

                ${!isNil(summary) ? `\n${summary}` : ''}
                ${!isNil(image) ? `\n![${name}](${image.medium})` : ''}

                [Veja informações sobre o episódio](${url})
                
            `
        }
    };
}

function EndedShowError(name, url) {
    this.name = 'EndedShowError';
    this.message = {
        title: `${name} já foi finalizada.`,
        comment: `
            _${name}_ já acabou, mas se você quiser saber mais sobre a série, [acesse aqui](${url})`
    };
}

function main(context, done) {
    const { show, days } = context.params;
    const server = `http://api.tvmaze.com/singlesearch/shows?q=${show}&embed=episodes`;

    return request.get(server)
        .then(({ body }) => {
            const { name, rating, network, _embedded, status, url } = body;

            if (status == 'Ended') {
                throw new EndedShowError(name, url);
            }

            const today = moment().format('YYYY-MM-DD');
            const maxDay = moment().add(days, 'days').format('YYYY-MM-DD');
            const isBetween = allPass([lte(today), gte(maxDay)]);
            const episodes = filter(
                propSatisfies(isBetween, 'airdate'),
                body._embedded.episodes
            );
            const alerts = mergeAll(map(
                episode => createAlert(episode, name, rating, network),
                episodes
            ));
            done(alerts);
        })
        .catch(err => {
            return err instanceof EndedShowError
                ? done([err.message])
                : done([])
        });
}

const params = {
    show: {
        description: 'Qual série você deseja acompanhar?',
        type: Text
    },
    days: {
        description: 'Com quantos dias de antecedência você deseja ser informado?',
        type: Natural,
        default: 30
    }
};

const app = create(main, { params, primaryKey: true });

module.exports = app;