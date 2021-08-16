using System;

namespace While1
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Poupança");

            double valorInvestido = 1000.00;

            int contadorMes = 1;

            while (contadorMes <= 12)
            {
                valorInvestido = valorInvestido + valorInvestido * (0.36 / 100); //0.36%

                Console.WriteLine("O valor após o mês " + contadorMes + " será R$ " + valorInvestido);
                contadorMes++; //contadorMes = contadorMes + 1

                //contadorMes += 1 caso for outro números
            }

            
        }
    }
}
