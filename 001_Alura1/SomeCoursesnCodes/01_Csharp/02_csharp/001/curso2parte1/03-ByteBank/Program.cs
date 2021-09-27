using System;

namespace _03_ByteBank
{
    class Program
    {
        static void Main(string[] args)
        {
            ContaCorrente contaDaGabriela = new ContaCorrente();
            contaDaGabriela.titular = "Gabriela";
            contaDaGabriela.agencia = 863;
            contaDaGabriela.numero = 863452;

            ContaCorrente contaDaGabrielaCosta = new ContaCorrente();
            contaDaGabriela.titular = "Gabriela";
            contaDaGabriela.agencia = 863;
            contaDaGabriela.numero = 863452;

            int valor = 6;
            int outroValor = 6;

            Console.WriteLine(valor == outroValor);

            Console.WriteLine(contaDaGabriela == contaDaGabrielaCosta); //comparando referências

            contaDaGabriela = contaDaGabrielaCosta; //igualando atribuindo mesma referência na memória

            Console.WriteLine(contaDaGabriela == contaDaGabrielaCosta);

            contaDaGabriela.saldo = 300;

            Console.WriteLine(contaDaGabriela.saldo);
            Console.WriteLine(contaDaGabrielaCosta.saldo);
        
            if(contaDaGabriela.saldo > 100)
            {
                contaDaGabriela.saldo -= 100;
                Console.WriteLine(contaDaGabriela.saldo);
            }

            Console.WriteLine(contaDaGabrielaCosta.saldo);

        }
    }
}
