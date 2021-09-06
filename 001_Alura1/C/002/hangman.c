#include <stdio.h>
#include <string.h>

char palavrasecreta[20];
char chutes[26];
int tentativas = 0;

void abertura() {
    printf("/****************/\n");
    printf("/ Jogo de Forca */\n");
    printf("/****************/\n\n");
}

void chuta() {
    char chute;
    printf("Qual letra? ");
    scanf(" %c", &chute);

    chutes[tentativas] = chute;
    tentativas++;
}

int jachutou(char letra) {
    int achou = 0;
    for(int j = 0; j < tentativas; j++) {
        if(chutes[j] == letra) {
            achou = 1;
            break;
        }
    }

    return achou;
}

void desenhaforca() {

    printf("Você já deu %d chutes\n", tentativas);

    for(int i = 0; i < strlen(palavrasecreta); i++) {

        if(jachutou(palavrasecreta[i])) {
            printf("%c ", palavrasecreta[i]);
        } else {
            printf("_ ");
        }

    }
    printf("\n");

}

void escolhepalavra() {
    sprintf(palavrasecreta, "MELANCIA");
}

int main() {

    int acertou = 0;
    int enforcou = 0;

    abertura();
    escolhepalavra();

    do {

        desenhaforca();
        chuta();

    } while (!acertou && !enforcou);

}

/*
#include <stdio.h>
#include <string.h>

void opening(){
    printf("**** hangman game ****\n");
    printf("**** type a letter ***\n");
}

void guess(char guesses[26], int* attempts){
    char guess;

      //number of letters in the alphabet //stores each typed letter

    scanf(" %c", &guess);
    
    guesses[(*attempts)] = guess;  //store each guess in each attempt  //(*) means passing what is the content to a variable, content
    (*attempts)++;
}

int main(){
    char secretword[20];

    sprintf(secretword, "watermelon");

    int you_hit = 0; //boolean false
    int hanged = 0; 

    char guesses[26]; //not the guesses variable in function guess
    int attempts = 0; // not the attempts variable in the function guess
    
    printf("%d  %d", &guesses[0], &guesses[1]);  //& show the memory adress //a array is a pointer that points to the first index position
    opening();
    //printf("%s \n", secretword);

    do {
        for(int i = 0; i < strlen(secretword); i++){ //for through all secretword length
            int find = 0;
            for(int j = 0; j < attempts; j++){  //for through each letter
                if(guesses[j] == secretword[i]){  //secretword[i] is the finded letter in the word
                    find = 1;
                    break;
                }
            }
            if(find){
                printf(" %c ", secretword[i]);
            } else {
                printf(" _ ");
            }
        }
        printf("\n");
        guess(guesses, &attempts);
        

        
    }while(!you_hit && !hanged);    
}
*/